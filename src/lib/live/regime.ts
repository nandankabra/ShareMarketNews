import { last, sma } from "@/lib/ta/moving-average";
import { toWeekly } from "@/lib/ta/resample";
import type { Candle } from "@/lib/ta/types";
import { atrPercentRank, volatilityRegime, type VolatilityRegime } from "@/lib/ta/volatility";

const MIN_WEEKLY_BARS = 15;
const FLAT_BAND_PERCENT = 0.5;

export type TrendDirection = "UP" | "DOWN" | "FLAT";

export type Confluence = {
  daily: TrendDirection;
  weekly: TrendDirection;
  aligned: boolean;
};

export type Regime = {
  confluence: Confluence | null;
  volatility: { atrPercentRank: number | null; regime: VolatilityRegime | null };
};

/** Close vs. its own trailing average, with a dead zone around "flat". */
function trendDirection(closes: number[], period: number): TrendDirection {
  const close = closes.at(-1) ?? null;
  const average = last(sma(closes, period));
  if (close == null || average == null || average === 0) return "FLAT";

  const distancePercent = ((close - average) / average) * 100;
  if (distancePercent > FLAT_BAND_PERCENT) return "UP";
  if (distancePercent < -FLAT_BAND_PERCENT) return "DOWN";
  return "FLAT";
}

/**
 * Regime, the way `analyse()` is Analysis: one pure function over one array
 * of daily bars. Kept separate from `analyse()` because it composes a
 * resample step `analyse()` has no other use for.
 */
export function analyseRegime(candles: Candle[]): Regime {
  const weekly = toWeekly(candles);

  const confluence: Confluence | null =
    weekly.length >= MIN_WEEKLY_BARS
      ? (() => {
          const daily = trendDirection(candles.map((c) => c.c), 50);
          const weeklyTrend = trendDirection(weekly.map((c) => c.c), 10);
          return { daily, weekly: weeklyTrend, aligned: daily === weeklyTrend && daily !== "FLAT" };
        })()
      : null;

  const percentRank = atrPercentRank(candles);

  return {
    confluence,
    volatility: { atrPercentRank: percentRank, regime: volatilityRegime(percentRank) },
  };
}
