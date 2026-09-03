import { z } from "zod";

import { parseNseDate } from "@/lib/date/ist";

import { ProviderError } from "../errors";
import type { HistoricalBar } from "./parse-historical";

/**
 * Daily OHLC for an index, which is a different endpoint and a different shape
 * from the equity one.
 *
 * `generateSecurityWiseHistoricalData` — what `parse-historical` reads — is
 * pinned to `series=EQ`, so asking it for NIFTY 50 returns an empty series
 * rather than an error. `indicesHistory` is the index equivalent and answers
 * with `EOD_*` fields instead of `CH_*`.
 *
 * There is no intraday equivalent that answers. `chart-databyindex`, which
 * serves the intraday graph on NSE's own index pages, returns an empty
 * `grapthData` for every spelling of NIFTY 50 tried, and both
 * `historical/indicesHistory` and `historical/cm/equity` answer 503. So an
 * index chart is daily bars, and the only one of these paths that works is the
 * `historicalOR` prefix.
 */
const rowSchema = z.object({
  EOD_INDEX_NAME: z.string(),
  EOD_TIMESTAMP: z.string(),
  EOD_OPEN_INDEX_VAL: z.number(),
  EOD_HIGH_INDEX_VAL: z.number(),
  EOD_LOW_INDEX_VAL: z.number(),
  EOD_CLOSE_INDEX_VAL: z.number(),
  /** Shares traded across the index's constituents. Stands in for volume. */
  HIT_TRADED_QTY: z.number().nullable().optional(),
});

const envelopeSchema = z.object({ data: z.array(z.unknown()) });

export function parseIndexHistory(body: string, indexName: string): HistoricalBar[] {
  // A maintenance page and a bot challenge both arrive as HTML with a 200.
  if (body.trimStart().startsWith("<")) {
    throw new ProviderError({
      kind: "BLOCKED",
      source: "NSE_INDEX_HISTORY",
      message: `index history for ${indexName} came back as HTML`,
      detail: body.slice(0, 160),
    });
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_INDEX_HISTORY",
      message: `index history for ${indexName} was not JSON`,
      detail: body.slice(0, 160),
    });
  }

  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_INDEX_HISTORY",
      message: `index history for ${indexName} had no data array`,
    });
  }

  const bars: HistoricalBar[] = [];
  for (const entry of envelope.data.data) {
    const row = rowSchema.safeParse(entry);
    // One malformed row is skipped rather than failing the series.
    if (!row.success) continue;

    // "02-SEP-2026" — the same DD-Mon-YYYY the rest of NSE uses, shouted.
    const day = parseNseDate(row.data.EOD_TIMESTAMP);
    if (!day) continue;

    bars.push({
      day,
      open: row.data.EOD_OPEN_INDEX_VAL,
      high: row.data.EOD_HIGH_INDEX_VAL,
      low: row.data.EOD_LOW_INDEX_VAL,
      close: row.data.EOD_CLOSE_INDEX_VAL,
      // The endpoint reports no previous close; the bar before carries it.
      previousClose: null,
      volume: row.data.HIT_TRADED_QTY ?? null,
    });
  }

  if (bars.length === 0) {
    throw new ProviderError({
      kind: "NOT_FOUND",
      source: "NSE_INDEX_HISTORY",
      message: `no usable bars for ${indexName}`,
    });
  }

  // NSE returns newest first; charts and indicators read oldest to newest.
  return bars.sort((a, b) => a.day.localeCompare(b.day));
}
