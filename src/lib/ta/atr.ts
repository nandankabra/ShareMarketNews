import type { Candle, Series } from "./types";

/** True range: the widest of today's span and today's gap from yesterday. */
export function trueRange(current: Candle, previous: Candle | undefined): number {
  if (!previous) return current.h - current.l;
  return Math.max(
    current.h - current.l,
    Math.abs(current.h - previous.c),
    Math.abs(current.l - previous.c),
  );
}

/**
 * Average True Range, Wilder-smoothed like RSI and for the same reason.
 *
 * ATR is the unit the rest of the app measures distance in. "Resistance is 3.1%
 * above" does not say whether it is reachable today; "1.7 ATR away" does, and
 * it compares sensibly across a ₹60 small-cap and a ₹8,000 large-cap.
 */
export function atr(candles: Candle[], period = 14): Series {
  const out: Series = new Array(candles.length).fill(null);
  if (candles.length <= period) return out;

  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trueRange(candles[i], candles[i - 1]);
  let current = sum / period;
  out[period] = current;

  for (let i = period + 1; i < candles.length; i++) {
    current = (current * (period - 1) + trueRange(candles[i], candles[i - 1])) / period;
    out[i] = current;
  }

  return out;
}
