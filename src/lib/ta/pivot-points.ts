import type { Candle } from "./types";

/**
 * Floor-trader pivots: one level set derived from the previous period's range.
 *
 * Not to be confused with `./pivots`, which finds swing highs and lows in the
 * series itself. These are arithmetic — a single high, low and close go in and
 * eleven horizontal lines come out — and they are what "Pivots Traditional" on
 * a broker's chart draws.
 *
 * The traditional formulas, matching what charting packages label Traditional:
 *
 *   P  = (H + L + C) / 3
 *   R1 = 2P - L            S1 = 2P - H
 *   R2 = P + (H - L)       S2 = P - (H - L)
 *   R3 = 2P + (H - 2L)     S3 = 2P - (2H - L)
 *   R4 = 3P + (H - 3L)     S4 = 3P - (3H - L)
 *   R5 = 4P + (H - 4L)     S5 = 4P - (4H - L)
 *
 * Worth knowing what they are before trading off them: every level here is a
 * restatement of one previous bar's range. They are widely watched, which is
 * the honest argument for drawing them — not that the arithmetic knows
 * anything.
 */
export type PivotLevels = {
  p: number;
  r: [number, number, number, number, number];
  s: [number, number, number, number, number];
};

export function pivotLevels(high: number, low: number, close: number): PivotLevels {
  const p = (high + low + close) / 3;
  return {
    p,
    r: [
      2 * p - low,
      p + (high - low),
      2 * p + (high - 2 * low),
      3 * p + (high - 3 * low),
      4 * p + (high - 4 * low),
    ],
    s: [
      2 * p - high,
      p - (high - low),
      2 * p - (2 * high - low),
      3 * p - (3 * high - low),
      4 * p - (4 * high - low),
    ],
  };
}

/**
 * Pivots for the period the chart is showing, from the period before it.
 *
 * An intraday chart takes yesterday's daily bar; a daily chart takes the
 * previous week. Which is why this takes already-grouped candles and simply
 * uses the last complete one: the grouping decision belongs to the caller,
 * who knows what interval is on screen.
 */
export function pivotsFromPrevious(periods: Candle[]): PivotLevels | null {
  // The newest period is the one in progress — pivots come from the last
  // *finished* one, or they would move under the price all session.
  const previous = periods.at(-2);
  if (!previous) return null;
  return pivotLevels(previous.h, previous.l, previous.c);
}
