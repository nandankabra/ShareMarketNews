import { last, sma } from "./moving-average";

export type TrendDirection = "UP" | "DOWN" | "FLAT";

/** FULL: every timeframe agrees. MAJORITY: the ones that trend agree, the rest are flat. MIXED: they contradict. NONE: nothing trends. */
export type Alignment = "FULL" | "MAJORITY" | "MIXED" | "NONE";

export type TimeframeLabel = "daily" | "weekly" | "monthly";

export type TimeframeTrend = {
  label: TimeframeLabel;
  /** Bars in the trailing average this timeframe was judged against. */
  period: number;
  direction: TrendDirection;
  /** Close vs. its own trailing average, in percent. Null until the average fills. */
  distancePercent: number | null;
  /** Which way the average itself points, or null when there is not enough of it to say. Price above a falling average is a weaker uptrend than price above a rising one. */
  slope: TrendDirection | null;
};

export type Confluence = {
  timeframes: TimeframeTrend[];
  alignment: Alignment;
  /** Where the weighted timeframes lean overall. */
  direction: TrendDirection;
  /** -100 (every timeframe down, averages confirming) to +100. */
  score: number;
};

const FLAT_BAND_PERCENT = 0.5;
const SLOPE_FLAT_BAND_PERCENT = 0.2;

/** Longer timeframes carry more weight — a monthly trend outlives a daily one. */
const WEIGHT: Record<TimeframeLabel, number> = { daily: 1, weekly: 2, monthly: 3 };

function classify(percent: number, band: number): TrendDirection {
  if (percent > band) return "UP";
  if (percent < -band) return "DOWN";
  return "FLAT";
}

/**
 * One timeframe's trend: where the close sits against its trailing average,
 * and where that average is itself heading over the last `slopeLookback` bars.
 * Both halves matter — the first says what the price is doing now, the second
 * says whether the market has been agreeing with it.
 */
export function timeframeTrend(
  label: TimeframeLabel,
  closes: number[],
  period: number,
  slopeLookback: number,
): TimeframeTrend {
  const close = closes.at(-1) ?? null;
  const average = sma(closes, period);
  const current = last(average);
  const earlier = average[average.length - 1 - slopeLookback] ?? null;

  const distancePercent = close != null && current ? ((close - current) / current) * 100 : null;
  const slopePercent = current != null && earlier ? ((current - earlier) / earlier) * 100 : null;

  return {
    label,
    period,
    direction: distancePercent == null ? "FLAT" : classify(distancePercent, FLAT_BAND_PERCENT),
    distancePercent,
    slope: slopePercent == null ? null : classify(slopePercent, SLOPE_FLAT_BAND_PERCENT),
  };
}

/**
 * How much the timeframes agree with each other.
 *
 * Descriptive only: a score of +100 says every timeframe present points the
 * same way with its average confirming, not that anything should be bought.
 */
export function confluenceOf(timeframes: TimeframeTrend[]): Confluence {
  const totalWeight = timeframes.reduce((sum, timeframe) => sum + WEIGHT[timeframe.label], 0);

  const weighted = timeframes.reduce((sum, timeframe) => {
    const vote = timeframe.direction === "UP" ? 1 : timeframe.direction === "DOWN" ? -1 : 0;
    // An average heading the other way halves the vote. An average we cannot
    // yet measure does not penalise it — unknown is not disagreement.
    const confirmed = timeframe.slope == null || timeframe.slope === timeframe.direction ? 1 : 0.5;
    return sum + WEIGHT[timeframe.label] * vote * confirmed;
  }, 0);

  const score = totalWeight === 0 ? 0 : (weighted / totalWeight) * 100;
  const ups = timeframes.filter((timeframe) => timeframe.direction === "UP").length;
  const downs = timeframes.filter((timeframe) => timeframe.direction === "DOWN").length;

  const alignment: Alignment =
    ups > 0 && downs > 0
      ? "MIXED"
      : ups === 0 && downs === 0
        ? "NONE"
        : ups === timeframes.length || downs === timeframes.length
          ? "FULL"
          : "MAJORITY";

  return {
    timeframes,
    alignment,
    direction: score > 0 ? "UP" : score < 0 ? "DOWN" : "FLAT",
    score,
  };
}
