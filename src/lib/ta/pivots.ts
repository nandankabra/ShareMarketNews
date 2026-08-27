import type { Candle } from "./types";

export type Pivot = {
  index: number;
  price: number;
  kind: "HIGH" | "LOW";
  volume: number | null;
};

/**
 * Fractal swing pivots: a bar whose high beats the `lookback` bars on both
 * sides is a swing high, and the mirror for lows.
 *
 * A lookback of 2 is deliberately small. Larger values find only the most
 * obvious turns, which produces two or three levels on a year of data — too
 * few to cluster meaningfully. The clustering step downstream is what removes
 * the noise, so this step is allowed to be generous.
 */
export function findPivots(candles: Candle[], lookback = 2): Pivot[] {
  const out: Pivot[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].h >= candles[i].h) isHigh = false;
      if (candles[j].l <= candles[i].l) isLow = false;
      if (!isHigh && !isLow) break;
    }

    if (isHigh) out.push({ index: i, price: candles[i].h, kind: "HIGH", volume: candles[i].v });
    if (isLow) out.push({ index: i, price: candles[i].l, kind: "LOW", volume: candles[i].v });
  }

  return out;
}
