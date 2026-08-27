import { z } from "zod";

import { ProviderError } from "../errors";

const schema = z.object({
  quotes: z.array(
    z.object({
      symbol: z.string().optional(),
      exchange: z.string().optional(),
      exchDisp: z.string().optional(),
      quoteType: z.string().optional(),
      shortname: z.string().optional(),
      longname: z.string().optional(),
      sector: z.string().optional(),
      industry: z.string().optional(),
    }),
  ),
});

export type SearchHit = {
  yahooSymbol: string;
  nseSymbol: string;
  name: string;
  exchange: string;
  sector: string | null;
  industry: string | null;
};

export function parseSearch(body: string): SearchHit[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError({
      kind: "SHAPE",
      source: "YAHOO_SEARCH",
      message: "search was not JSON",
      detail: body.slice(0, 160),
    });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError({
      kind: "SHAPE",
      source: "YAHOO_SEARCH",
      message: "search shape changed",
    });
  }

  const out: SearchHit[] = [];
  for (const hit of parsed.data.quotes) {
    // NSI is Yahoo's code for the NSE. Filtering here rather than in the UI
    // keeps BSE and US listings out of a panel that only understands NSE.
    if (!hit.symbol || hit.exchange !== "NSI" || hit.quoteType !== "EQUITY") continue;

    out.push({
      yahooSymbol: hit.symbol,
      nseSymbol: hit.symbol.replace(/\.NS$/i, "").toUpperCase(),
      name: hit.longname ?? hit.shortname ?? hit.symbol,
      exchange: hit.exchDisp ?? "NSE",
      sector: hit.sector ?? null,
      industry: hit.industry ?? null,
    });
  }

  return out;
}
