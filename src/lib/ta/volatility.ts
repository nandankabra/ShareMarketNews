import { atr } from "./atr";
import type { Candle } from "./types";

export type VolatilityRegime = "LOW" | "NORMAL" | "HIGH";
export type VolatilityTrend = "EXPANDING" | "CONTRACTING" | "STABLE";

const TREND_HORIZON = 10;
/** Percentile points of movement before a drift counts as a change of regime. */
const TREND_BAND = 15;

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

/**
 * Which way the regime is moving: today's ATR percentile against the same
 * measure `horizon` sessions ago. A share can sit mid-range and still be
 * opening up fast, which the bucket on its own cannot say.
 */
export function volatilityTrend(
  candles: Candle[],
  period = 14,
  lookback = 252,
  horizon = TREND_HORIZON,
): VolatilityTrend | null {
  const now = atrPercentRank(candles, period, lookback);
  const before = atrPercentRank(candles.slice(0, -horizon), period, lookback);
  if (now == null || before == null) return null;

  const delta = now - before;
  if (delta >= TREND_BAND) return "EXPANDING";
  if (delta <= -TREND_BAND) return "CONTRACTING";
  return "STABLE";
}
