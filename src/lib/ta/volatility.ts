import { atr } from "./atr";
import type { Candle } from "./types";

export type VolatilityRegime = "LOW" | "NORMAL" | "HIGH";

/**
 * Where today's ATR% sits against its own trailing year, as a percentile
 * (0-100). Comparing ATR% to its own history rather than to a fixed
 * threshold is what lets the same function say something true about both a
 * sleepy FMCG name and a volatile small-cap.
 */
export function atrPercentRank(candles: Candle[], period = 14, lookback = 252): number | null {
  if (candles.length <= period) return null;

  const atrSeries = atr(candles, period);
  const atrPercentSeries: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const value = atrSeries[i];
    const close = candles[i].c;
    if (value != null && close) atrPercentSeries.push((value / close) * 100);
  }
  if (atrPercentSeries.length === 0) return null;

  const window = atrPercentSeries.slice(-lookback);
  const latest = window[window.length - 1];
  const below = window.filter((value) => value <= latest).length;
  return (below / window.length) * 100;
}

export function volatilityRegime(percentRank: number | null): VolatilityRegime | null {
  if (percentRank == null) return null;
  if (percentRank >= 75) return "HIGH";
  if (percentRank <= 25) return "LOW";
  return "NORMAL";
}
