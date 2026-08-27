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
