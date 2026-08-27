import { sma } from "./moving-average";
import type { Series } from "./types";

export type Bollinger = { middle: Series; upper: Series; lower: Series; bandwidth: Series };

/**
 * Bollinger Bands. `bandwidth` is normalised by the middle band so it can be
 * compared across time and across shares — an absolute band width is only
 * meaningful next to the price it came from.
 */
export function bollinger(closes: number[], period = 20, deviations = 2): Bollinger {
  const middle = sma(closes, period);
  const upper: Series = new Array(closes.length).fill(null);
  const lower: Series = new Array(closes.length).fill(null);
  const bandwidth: Series = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const mean = middle[i];
    if (mean == null) continue;

    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - mean) ** 2;
    const sd = Math.sqrt(variance / period);

    upper[i] = mean + deviations * sd;
    lower[i] = mean - deviations * sd;
    bandwidth[i] = mean === 0 ? null : ((upper[i]! - lower[i]!) / mean) * 100;
  }

  return { middle, upper, lower, bandwidth };
}
