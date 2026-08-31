import { z } from "zod";

import { ProviderError } from "../errors";

/**
 * Today's price path, one point per minute.
 *
 * The daily-bar endpoints answer with yesterday's close until the session ends,
 * which is correct for analysis and useless for watching. This is the series
 * behind BSE's own intraday chart: 09:15 to now, a minute apart, with the
 * volume traded in each.
 *
 * `vale1` is one price per minute, not a bar — so a one-minute candle here
 * would have open, high, low and close all equal, which is a line drawn as a
 * candle. Aggregation into five- or fifteen-minute buckets is what makes a real
 * body and wick, and `toCandles` is where that happens.
 *
 * Numbers arrive as strings, and `dttm` as "Mon Aug 31 2026 09:15:59" — a
 * format `new Date()` parses but only by luck of it being US-locale English, so
 * it is taken apart explicitly instead.
 */
const pointSchema = z.object({
  dttm: z.string(),
  vale1: z.string(),
  vole: z.string().optional(),
});

const envelopeSchema = z.object({
  Data: z.string(),
  PrevClose: z.union([z.string(), z.number()]).nullable().optional(),
  CurrVal: z.union([z.string(), z.number()]).nullable().optional(),
  CurrTime: z.string().nullable().optional(),
  HighVal: z.union([z.string(), z.number()]).nullable().optional(),
  LowVal: z.union([z.string(), z.number()]).nullable().optional(),
});

export type IntradayPoint = {
  /** Epoch milliseconds, IST. */
  at: number;
  price: number;
  volume: number | null;
};

export type IntradaySeries = {
  points: IntradayPoint[];
  previousClose: number | null;
  lastPrice: number | null;
  /** The session's real extremes, computed from the series. */
  dayHigh: number | null;
  dayLow: number | null;
  /** BSE's rounded chart bounds. Not the high and low — see parse below. */
  axisHigh: number | null;
  axisLow: number | null;
  /** BSE's own "as of", which is the honest timestamp for the last point. */
  asOf: string | null;
};

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** "Mon Aug 31 2026 09:15:59" → epoch ms, read as IST (+05:30). */
function parseBseTimestamp(value: string): number | null {
  const match = /^\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const month = MONTHS[match[1]];
  if (month === undefined) return null;

  // The wall clock is IST; Date.UTC plus a fixed offset avoids depending on
  // whatever timezone the server happens to run in.
  return Date.UTC(
    Number(match[3]), month, Number(match[2]),
    Number(match[4]), Number(match[5]), Number(match[6]),
  ) - 5.5 * 3_600_000;
}

function num(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBseIntraday(body: string, scripCode: string): IntradaySeries {
  if (body.trimStart().startsWith("<")) {
    throw new ProviderError({
      kind: "BLOCKED",
      source: "BSE_QUOTES",
      message: `intraday for ${scripCode} came back as HTML`,
      detail: body.slice(0, 160),
    });
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError({
      kind: "SHAPE",
      source: "BSE_QUOTES",
      message: `intraday for ${scripCode} was not JSON`,
      detail: body.slice(0, 160),
    });
  }

  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new ProviderError({
      kind: "SHAPE",
      source: "BSE_QUOTES",
      message: `intraday for ${scripCode} had no Data field`,
    });
  }

  // Data is JSON *inside* a JSON string — double-encoded by the upstream.
  let inner: unknown;
  try {
    inner = JSON.parse(envelope.data.Data);
  } catch {
    throw new ProviderError({
      kind: "SHAPE",
      source: "BSE_QUOTES",
      message: `intraday for ${scripCode} had an unparseable Data payload`,
    });
  }

  const points: IntradayPoint[] = [];
  for (const entry of Array.isArray(inner) ? inner : []) {
    const point = pointSchema.safeParse(entry);
    if (!point.success) continue;

    const at = parseBseTimestamp(point.data.dttm);
    const price = num(point.data.vale1);
    // A zero price is a placeholder for a minute with no trade, not a crash to
    // zero — plotting it would draw a spike to the axis.
    if (at == null || price == null || price <= 0) continue;

    points.push({ at, price, volume: num(point.data.vole ?? null) });
  }

  points.sort((a, b) => a.at - b.at);

  // `HighVal` and `LowVal` are the *chart axis* bounds, not the session's high
  // and low — they arrive pre-rounded to whole numbers that bracket the data.
  // Measured against LOTUSDEV mid-session: the field said 186/180 while the
  // series itself ranged 185.65/180.15, and against Lotus Chocolate it said
  // 680/600 for a real 664/610. Taking them at face value put a visibly wrong
  // range on the page and mis-placed the day-range marker.
  const prices = points.map((point) => point.price);

  return {
    points,
    previousClose: num(envelope.data.PrevClose),
    lastPrice: num(envelope.data.CurrVal) ?? points.at(-1)?.price ?? null,
    dayHigh: prices.length ? Math.max(...prices) : null,
    dayLow: prices.length ? Math.min(...prices) : null,
    /** BSE's rounded axis bounds, kept only so a chart can pad its scale. */
    axisHigh: num(envelope.data.HighVal),
    axisLow: num(envelope.data.LowVal),
    asOf: envelope.data.CurrTime ?? null,
  };
}
