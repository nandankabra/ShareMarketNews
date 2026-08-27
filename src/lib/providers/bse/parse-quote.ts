import { z } from "zod";

import { ProviderError } from "../errors";

/** Every numeric arrives as a string, and "" where there is no value. */
const numeric = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value.replace(/,/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  });

const schema = z.object({
  CurrRate: z.object({ LTP: numeric, Chg: numeric, PcChg: numeric }).optional(),
  Header: z.object({ PrevClose: numeric, Open: numeric, High: numeric, Low: numeric, LTP: numeric }).optional(),
  Cmpname: z.object({ FullN: z.string().optional() }).optional(),
});

export type BseQuote = {
  name: string | null;
  lastPrice: number | null;
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  change: number | null;
  changePercent: number | null;
};

export function parseBseQuote(body: string, scripCode: string): BseQuote {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError({
      kind: "SHAPE",
      source: "BSE_QUOTES",
      message: `quote for ${scripCode} was not JSON`,
      detail: body.slice(0, 160),
    });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError({ kind: "SHAPE", source: "BSE_QUOTES", message: "quote shape changed" });
  }

  const last = parsed.data.CurrRate?.LTP ?? parsed.data.Header?.LTP ?? null;
  if (last == null) {
    // BSE answers 200 with empty rates for a code it does not recognise.
    throw new ProviderError({
      kind: "NOT_FOUND",
      source: "BSE_QUOTES",
      message: `BSE has no live price for scrip ${scripCode}`,
    });
  }

  return {
    name: parsed.data.Cmpname?.FullN?.trim() ?? null,
    lastPrice: last,
    previousClose: parsed.data.Header?.PrevClose ?? null,
    open: parsed.data.Header?.Open ?? null,
    dayHigh: parsed.data.Header?.High ?? null,
    dayLow: parsed.data.Header?.Low ?? null,
    change: parsed.data.CurrRate?.Chg ?? null,
    changePercent: parsed.data.CurrRate?.PcChg ?? null,
  };
}

const highLowSchema = z.object({
  Fifty2WkHigh_adj: numeric,
  Fifty2WkLow_adj: numeric,
});

export type BseHighLow = { week52High: number | null; week52Low: number | null };

/**
 * BSE's 52-week range, from a separate endpoint to the quote.
 *
 * The adjusted figures, not the raw ones: adjusted values account for splits
 * and bonuses, so a share that split during the year does not appear to have
 * halved. The unadjusted fields arrive with the date glued onto the number
 * ("3336.70 (03/02/2026)") and would need unpicking anyway.
 */
export function parseBseHighLow(body: string): BseHighLow {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError({ kind: "SHAPE", source: "BSE_QUOTES", message: "high/low was not JSON" });
  }

  const parsed = highLowSchema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError({ kind: "SHAPE", source: "BSE_QUOTES", message: "high/low shape changed" });
  }

  return { week52High: parsed.data.Fifty2WkHigh_adj, week52Low: parsed.data.Fifty2WkLow_adj };
}
