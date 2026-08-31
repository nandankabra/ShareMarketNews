import type { Candle } from "@/lib/ta/types";

import type { IntradayPoint } from "@/lib/providers/bse/parse-intraday";

/**
 * Turn a minute-by-minute price path into candles.
 *
 * The upstream gives one price per minute, so a one-minute "candle" would have
 * open, high, low and close all equal — a line drawn in candle costume. Real
 * bodies and wicks only appear once several minutes are grouped, which is why
 * the smallest interval offered is five.
 *
 * Worth being precise about what these wicks mean, because it is not quite what
 * a broker's chart shows: a five-minute high here is the highest of five
 * one-minute prices, not the highest tick in those five minutes. A spike that
 * happened and reversed inside one minute is invisible. The shape is right and
 * the extremes are slightly conservative.
 *
 * Pure, so it can be tested without a network.
 */
export function toIntradayCandles(points: IntradayPoint[], minutes: number): Candle[] {
  if (points.length === 0) return [];

  const bucketMs = minutes * 60_000;
  const candles: Candle[] = [];

  let bucketStart: number | null = null;
  let open = 0;
  let high = 0;
  let low = 0;
  let close = 0;
  let volume = 0;
  let hasVolume = false;

  const flush = () => {
    if (bucketStart == null) return;
    candles.push({ t: bucketStart, o: open, h: high, l: low, c: close, v: hasVolume ? volume : null });
  };

  for (const point of points) {
    // Floor to the bucket so boundaries land on the clock (09:15, 09:20, …)
    // rather than on wherever the first data point happened to arrive.
    const start = Math.floor(point.at / bucketMs) * bucketMs;

    if (start !== bucketStart) {
      flush();
      bucketStart = start;
      open = high = low = close = point.price;
      volume = point.volume ?? 0;
      hasVolume = point.volume != null;
      continue;
    }

    high = Math.max(high, point.price);
    low = Math.min(low, point.price);
    close = point.price;
    if (point.volume != null) {
      volume += point.volume;
      hasVolume = true;
    }
  }

  flush();
  return candles;
}

/** Intervals offered in the UI. One minute is deliberately absent — see above. */
export const INTRADAY_INTERVALS = [5, 15, 30, 60] as const;
export type IntradayInterval = (typeof INTRADAY_INTERVALS)[number];
