import type { Candle } from "./types";

/**
 * Heikin Ashi bars: each candle averaged into the one before it.
 *
 * Not price. That is the whole point and the whole danger — a Heikin Ashi
 * close is the average of a real bar's own OHLC, and its open is the midpoint
 * of the *previous* Heikin Ashi bar, so the body carries a memory the real
 * candle does not have. Runs look cleaner because noise has been averaged out
 * of them, and the last close is not the traded price.
 *
 *   close = (o + h + l + c) / 4
 *   open  = (previous open + previous close) / 2
 *   high  = max(h, open, close)
 *   low   = min(l, open, close)
 *
 * Volume and timestamps pass through untouched — only the body is derived.
 */
export function toHeikinAshi(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];

  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i];
    const close = (bar.o + bar.h + bar.l + bar.c) / 4;
    // The first bar has no previous average to open from, so it opens at the
    // real bar's own midpoint — the convention every charting package uses.
    const previous = out[i - 1];
    const open = previous ? (previous.o + previous.c) / 2 : (bar.o + bar.c) / 2;

    out.push({
      t: bar.t,
      o: open,
      h: Math.max(bar.h, open, close),
      l: Math.min(bar.l, open, close),
      c: close,
      v: bar.v,
    });
  }

  return out;
}
