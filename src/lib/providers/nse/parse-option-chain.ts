import { z } from "zod";

import { ProviderError } from "../errors";

/** One side of one strike, as NSE reports it. */
const sideSchema = z.object({
  /** "01-09-2026" — DD-MM-YYYY here, not the DD-Mon-YYYY used elsewhere. */
  expiryDate: z.string().optional(),
  openInterest: z.number().optional(),
  changeinOpenInterest: z.number().optional(),
  totalTradedVolume: z.number().optional(),
  impliedVolatility: z.number().optional(),
  lastPrice: z.number().optional(),
  change: z.number().optional(),
});

/**
 * The expiry lives on the CE/PE objects, not on the row: the row itself has an
 * `expiryDates` key that is null. Discovered the hard way — requiring it at row
 * level made every row fail to parse and the chain came back empty.
 */
const rowSchema = z.object({
  strikePrice: z.number(),
  CE: sideSchema.optional(),
  PE: sideSchema.optional(),
});

/** NSE uses DD-MM-YYYY inside the chain rows. Returns an IST day key. */
function parseChainDate(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

const schema = z.object({
  records: z.object({
    data: z.array(z.unknown()),
    underlyingValue: z.number().optional(),
    expiryDates: z.array(z.string()).optional(),
    timestamp: z.string().optional(),
  }),
});

export type OptionSide = {
  oi: number | null;
  oiChange: number | null;
  volume: number | null;
  /** NSE reports 0 for a strike with no trades — that is absent, not zero vol. */
  iv: number | null;
  ltp: number | null;
  change: number | null;
};

export type OptionRow = {
  strikePrice: number;
  ce: OptionSide | null;
  pe: OptionSide | null;
};

export type OptionChain = {
  expiryDate: string;
  underlyingValue: number;
  rows: OptionRow[];
};

function side(raw: z.infer<typeof sideSchema> | undefined): OptionSide | null {
  if (!raw) return null;
  return {
    oi: raw.openInterest ?? null,
    oiChange: raw.changeinOpenInterest ?? null,
    volume: raw.totalTradedVolume ?? null,
    // A zero IV means "never traded", not "zero volatility". Storing the zero
    // would drag every average toward nothing.
    iv: raw.impliedVolatility && raw.impliedVolatility > 0 ? raw.impliedVolatility : null,
    ltp: raw.lastPrice ?? null,
    change: raw.change ?? null,
  };
}

export function parseOptionChain(body: string, wantExpiry: string): OptionChain {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_OPTION_CHAIN",
      message: "option chain was not JSON",
      detail: body.slice(0, 160),
    });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    // An empty object is what NSE returns for an expiry it does not recognise.
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_OPTION_CHAIN",
      message: `option chain shape changed or expiry unknown: ${parsed.error.issues[0]?.path.join(".")}`,
    });
  }

  const underlyingValue = parsed.data.records.underlyingValue;
  if (typeof underlyingValue !== "number") {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_OPTION_CHAIN",
      message: "option chain carried no underlying value",
    });
  }

  const rows: OptionRow[] = [];
  for (const entry of parsed.data.records.data) {
    const row = rowSchema.safeParse(entry);
    if (!row.success) continue;

    // v3 is filtered by expiry already, but older paths carried every expiry in
    // one payload. Filtering here keeps the parser correct under either.
    const rowExpiry = parseChainDate(row.data.CE?.expiryDate ?? row.data.PE?.expiryDate);
    if (rowExpiry && rowExpiry !== wantExpiry) continue;

    rows.push({
      strikePrice: row.data.strikePrice,
      ce: side(row.data.CE),
      pe: side(row.data.PE),
    });
  }

  if (rows.length === 0) {
    throw new ProviderError({
      kind: "NOT_FOUND",
      source: "NSE_OPTION_CHAIN",
      message: `no strikes for expiry ${wantExpiry}`,
    });
  }

  rows.sort((a, b) => a.strikePrice - b.strikePrice);
  return { expiryDate: wantExpiry, underlyingValue, rows };
}

const expirySchema = z.object({ expiryDates: z.array(z.string()) });

/** The contract-info endpoint, which lists the expiries currently listed. */
export function parseExpiryDates(body: string): string[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_OPTION_CHAIN",
      message: "contract info was not JSON",
    });
  }

  const parsed = expirySchema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_OPTION_CHAIN",
      message: "contract info carried no expiryDates",
    });
  }

  return parsed.data.expiryDates;
}
