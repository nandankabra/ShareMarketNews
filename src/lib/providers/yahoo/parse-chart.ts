import { z } from "zod";

import { ProviderError } from "../errors";

const metaSchema = z.object({
  currency: z.string().optional(),
  symbol: z.string(),
  regularMarketPrice: z.number().optional(),
  chartPreviousClose: z.number().optional(),
  previousClose: z.number().optional(),
  regularMarketDayHigh: z.number().optional(),
  regularMarketDayLow: z.number().optional(),
  fiftyTwoWeekHigh: z.number().optional(),
  fiftyTwoWeekLow: z.number().optional(),
  regularMarketVolume: z.number().optional(),
  regularMarketTime: z.number().optional(),
  longName: z.string().optional(),
  shortName: z.string().optional(),
});

const schema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: metaSchema,
          timestamp: z.array(z.number()).optional(),
          indicators: z
            .object({
              quote: z
                .array(
                  z.object({
                    open: z.array(z.number().nullable()).optional(),
                    high: z.array(z.number().nullable()).optional(),
                    low: z.array(z.number().nullable()).optional(),
                    close: z.array(z.number().nullable()).optional(),
                    volume: z.array(z.number().nullable()).optional(),
                  }),
                )
                .optional(),
            })
            .optional(),
        }),
      )
      .nullable(),
    error: z.object({ code: z.string(), description: z.string() }).nullable().optional(),
  }),
});

export type Bar = { at: Date; open: number; high: number; low: number; close: number; volume: number | null };

export type Quote = {
  symbol: string;
  name: string | null;
  currency: string;
  lastPrice: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  week52High: number | null;
  week52Low: number | null;
  volume: number | null;
  quotedAt: Date | null;
  bars: Bar[];
};

export function parseChart(body: string, symbol: string): Quote {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError({
      kind: "SHAPE",
      source: "YAHOO_QUOTES",
      message: `chart for ${symbol} was not JSON`,
      detail: body.slice(0, 160),
    });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError({
      kind: "SHAPE",
      source: "YAHOO_QUOTES",
      message: `chart shape changed: ${parsed.error.issues[0]?.path.join(".")}`,
    });
  }

  const result = parsed.data.chart.result?.[0];
  if (!result) {
    // Yahoo answers 200 with a null result for a symbol it does not list.
    throw new ProviderError({
      kind: "NOT_FOUND",
      source: "YAHOO_QUOTES",
      message: `Yahoo does not list ${symbol}`,
      detail: parsed.data.chart.error?.description,
    });
  }

  const meta = result.meta;
  const quote = result.indicators?.quote?.[0];
  const stamps = result.timestamp ?? [];

  const bars: Bar[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const open = quote?.open?.[i];
    const high = quote?.high?.[i];
    const low = quote?.low?.[i];
    const close = quote?.close?.[i];
    // Yahoo pads holidays and halts with nulls. A bar missing any of OHLC is
    // not a bar; carrying it forward would put a flat candle on a day the
    // market never opened.
    if (open == null || high == null || low == null || close == null) continue;
    bars.push({
      at: new Date(stamps[i] * 1000),
      open,
      high,
      low,
      close,
      volume: quote?.volume?.[i] ?? null,
    });
  }

  return {
    symbol: meta.symbol,
    name: meta.longName ?? meta.shortName ?? null,
    currency: meta.currency ?? "INR",
    lastPrice: meta.regularMarketPrice ?? null,
    previousClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
    dayHigh: meta.regularMarketDayHigh ?? null,
    dayLow: meta.regularMarketDayLow ?? null,
    week52High: meta.fiftyTwoWeekHigh ?? null,
    week52Low: meta.fiftyTwoWeekLow ?? null,
    volume: meta.regularMarketVolume ?? null,
    quotedAt: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : null,
    bars,
  };
}
