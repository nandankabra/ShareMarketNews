import { z } from "zod";

import { parseNseDate } from "@/lib/date/ist";

import { ProviderError } from "../errors";

/**
 * Daily OHLC from NSE's own historical endpoint.
 *
 * This exists because the assumption underneath the original design turned out
 * to be backwards. The plan had Yahoo serving history and NSE unreachable from
 * a datacenter; measured from the deployment, NSE answers fine and Yahoo is the
 * one that refuses. Yahoo was the only source of bars, so without this there
 * are no candles, no RSI, no MACD and no support levels — the whole analysis
 * half of the app.
 *
 * `CH_LAST_TRADED_PRICE` and `CH_CLOSING_PRICE` differ on days when the close
 * is set by the auction rather than the last trade. The close is the one every
 * indicator is defined against, so that is what a bar carries.
 */
const rowSchema = z.object({
  CH_SYMBOL: z.string(),
  mTIMESTAMP: z.string(),
  CH_OPENING_PRICE: z.number(),
  CH_TRADE_HIGH_PRICE: z.number(),
  CH_TRADE_LOW_PRICE: z.number(),
  CH_CLOSING_PRICE: z.number(),
  CH_PREVIOUS_CLS_PRICE: z.number().nullable().optional(),
  CH_TOT_TRADED_QTY: z.number().nullable().optional(),
});

const envelopeSchema = z.object({ data: z.array(z.unknown()) });

export type HistoricalBar = {
  /** IST day key, "YYYY-MM-DD". */
  day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  previousClose: number | null;
  volume: number | null;
};

export function parseHistorical(body: string, symbol: string): HistoricalBar[] {
  // The 200-on-failure rule applies here as everywhere: a maintenance page and
  // a bot challenge both arrive as HTML with a cheerful status code.
  if (body.trimStart().startsWith("<")) {
    throw new ProviderError({
      kind: "BLOCKED",
      source: "NSE_HISTORICAL",
      message: `historical data for ${symbol} came back as HTML`,
      detail: body.slice(0, 160),
    });
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_HISTORICAL",
      message: `historical data for ${symbol} was not JSON`,
      detail: body.slice(0, 160),
    });
  }

  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_HISTORICAL",
      message: `historical response for ${symbol} had no data array`,
    });
  }

  const bars: HistoricalBar[] = [];
  for (const entry of envelope.data.data) {
    const row = rowSchema.safeParse(entry);
    // One malformed row is skipped rather than failing the series: a single bad
    // day should not cost you a year of chart.
    if (!row.success) continue;

    const day = parseNseDate(row.data.mTIMESTAMP);
    if (!day) continue;

    bars.push({
      day,
      open: row.data.CH_OPENING_PRICE,
      high: row.data.CH_TRADE_HIGH_PRICE,
      low: row.data.CH_TRADE_LOW_PRICE,
      close: row.data.CH_CLOSING_PRICE,
      previousClose: row.data.CH_PREVIOUS_CLS_PRICE ?? null,
      volume: row.data.CH_TOT_TRADED_QTY ?? null,
    });
  }

  if (bars.length === 0) {
    throw new ProviderError({
      kind: "NOT_FOUND",
      source: "NSE_HISTORICAL",
      message: `no usable bars for ${symbol}`,
    });
  }

  // NSE returns newest first; every indicator here reads oldest to newest.
  return bars.sort((a, b) => a.day.localeCompare(b.day));
}
