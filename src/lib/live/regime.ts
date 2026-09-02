import { toMonthly, toWeekly } from "@/lib/ta/resample";
import { confluenceOf, timeframeTrend, type Confluence, type TimeframeTrend } from "@/lib/ta/trend";
import type { Candle } from "@/lib/ta/types";
import {
  atrPercentRank,
  volatilityRegime,
  volatilityTrend,
  type VolatilityRegime,
  type VolatilityTrend,
} from "@/lib/ta/volatility";

/**
 * The three views, with the trailing average each is judged against and how
 * far back its slope is measured.
 *
 * NSE's historical endpoint truncates to about seventy daily bars whatever
 * range you ask it for — fifteen weeks, five months. Every period here has to
 * fit inside that, which is why "monthly" is a quarter-length view rather
 * than the six-month one a deeper history would allow.
 */
const TIMEFRAMES = [
  { label: "daily", period: 50, slopeLookback: 10 },
  { label: "weekly", period: 10, slopeLookback: 3 },
  { label: "monthly", period: 3, slopeLookback: 1 },
] as const;

export type Volatility = {
  atrPercentRank: number | null;
  regime: VolatilityRegime | null;
  trend: VolatilityTrend | null;
};

export type Regime = {
  confluence: Confluence | null;
  volatility: Volatility;
};

/**
 * Regime, the way `analyse()` is Analysis: one pure function over one array
 * of daily bars. Kept separate from `analyse()` because it composes a
 * resample step `analyse()` has no other use for.
 *
 * The monthly timeframe joins only once there is enough of it to mean
 * something — a two-bar "monthly trend" is noise wearing a long name.
 */
export function analyseRegime(candles: Candle[]): Regime {
  const weekly = toWeekly(candles);
  const monthly = toMonthly(candles);

  const closesFor: Record<(typeof TIMEFRAMES)[number]["label"], number[]> = {
    daily: candles.map((candle) => candle.c),
    weekly: weekly.map((candle) => candle.c),
    monthly: monthly.map((candle) => candle.c),
  };

  // A timeframe whose average has not filled says nothing rather than voting
  // FLAT — silence and "no trend" are different answers, and only one of them
  // should move the score.
  const timeframes: TimeframeTrend[] = TIMEFRAMES.map((spec) =>
    timeframeTrend(spec.label, closesFor[spec.label], spec.period, spec.slopeLookback),
  ).filter((timeframe) => timeframe.distancePercent != null);

  const confluence: Confluence | null = timeframes.length > 0 ? confluenceOf(timeframes) : null;

  const percentRank = atrPercentRank(candles);

  return {
    confluence,
    volatility: {
      atrPercentRank: percentRank,
      regime: volatilityRegime(percentRank),
      trend: volatilityTrend(candles),
    },
  };
}
