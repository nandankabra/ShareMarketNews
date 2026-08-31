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

/**
 * Fold the live traded price into the candle still forming.
 *
 * The series advances once a minute, but the last traded price moves
 * continuously — so between minute points the newest candle would sit
 * motionless while the number above it changed. That is the difference between
 * a chart that updates and one that ticks: on a broker's screen the forming
 * candle's close follows the price, and its high and low stretch to admit it.
 *
 * Only ever touches the final candle, and only when the price belongs to the
 * bucket that candle covers. A price from a later bucket opens a new candle
 * rather than stretching the old one across a boundary it does not belong in.
 *
 * Pure, so the behaviour is pinned by tests rather than by watching a market.
 */
export function applyLivePrice(
  candles: Candle[],
  price: number | null,
  at: number,
  minutes: number,
): Candle[] {
  if (price == null || !Number.isFinite(price) || price <= 0) return candles;

  const bucketMs = minutes * 60_000;
  const bucket = Math.floor(at / bucketMs) * bucketMs;
  const last = candles.at(-1);

  if (!last || bucket > last.t) {
    // A new interval has begun and no point has landed in it yet.
    return [...candles, { t: bucket, o: price, h: price, l: price, c: price, v: null }];
  }

  if (bucket < last.t) return candles;

  return [
    ...candles.slice(0, -1),
    { ...last, h: Math.max(last.h, price), l: Math.min(last.l, price), c: price },
  ];
}

/** Intervals offered in the UI. One minute is deliberately absent — see above. */
export const INTRADAY_INTERVALS = [5, 15, 30, 60] as const;
export type IntradayInterval = (typeof INTRADAY_INTERVALS)[number];
