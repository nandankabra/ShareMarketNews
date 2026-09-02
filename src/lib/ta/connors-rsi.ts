import { rsi } from "./rsi";
import type { Series } from "./types";

/**
 * Connors RSI: three short-term measures of "how stretched is this", averaged.
 *
 * Its components ask different questions, which is why the composite says more
 * than any of them alone:
 *
 *  1. RSI of the close over `priceperiod` (3) — how hard has it just moved.
 *  2. RSI of the *streak* over `streakPeriod` (2) — how long has it moved that
 *     way without a break. The streak is +n after n up days, -n after n down.
 *  3. The percent rank of today's return against the last `rankPeriod` (100)
 *     of them — how unusual today's move is for this share.
 *
 * Averaged to 0-100. It swings far harder than a 14-period RSI: readings above
 * 90 and below 10 are routine rather than remarkable, which is exactly why it
 * is drawn against its own bands and not RSI's 70/30.
 */

/** Consecutive up or down closes, signed. Unchanged closes reset it to zero. */
export function streaks(closes: number[]): number[] {
  const out: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const previous = out[i - 1];
    if (change > 0) out[i] = previous > 0 ? previous + 1 : 1;
    else if (change < 0) out[i] = previous < 0 ? previous - 1 : -1;
    else out[i] = 0;
  }
  return out;
}

/**
 * Where today's return sits against the last `period` returns, 0-100.
 *
 * Strictly-less-than counting, which is the definition Connors uses: the
 * largest gain in the window ranks 100, and a value equal to others ranks
 * below them rather than among them.
 */
export function percentRankOfReturns(closes: number[], period: number): Series {
  const out: Series = new Array(closes.length).fill(null);
  const returns: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const previous = closes[i - 1];
    returns[i] = previous ? ((closes[i] - previous) / previous) * 100 : 0;
  }

  for (let i = 1; i < closes.length; i++) {
    const from = i - period;
    if (from < 1) continue;
    const window = returns.slice(from, i);
    if (window.length === 0) continue;
    const below = window.filter((value) => value < returns[i]).length;
    out[i] = (below / window.length) * 100;
  }

  return out;
}

export function connorsRsi(
  closes: number[],
  pricePeriod = 3,
  streakPeriod = 2,
  rankPeriod = 100,
): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length === 0) return out;

  const priceRsi = rsi(closes, pricePeriod);
  // The streak series is fed to RSI as if it were a price. That is the actual
  // definition, odd as it reads: RSI only ever looks at differences, and the
  // differences of a streak series are what carry the persistence.
  const streakRsi = rsi(streaks(closes), streakPeriod);
  const rank = percentRankOfReturns(closes, rankPeriod);

  for (let i = 0; i < closes.length; i++) {
    const a = priceRsi[i];
    const b = streakRsi[i];
    const c = rank[i];
    if (a == null || b == null || c == null) continue;
    out[i] = (a + b + c) / 3;
  }

  return out;
}
