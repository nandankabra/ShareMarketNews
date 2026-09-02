/** Percent change from `days` trading sessions ago to the latest close. */
export function periodReturn(closes: number[], days: number): number | null {
  if (closes.length <= days) return null;
  const start = closes[closes.length - 1 - days];
  const end = closes[closes.length - 1];
  if (!start) return null;
  return ((end - start) / start) * 100;
}

/**
 * The windows the composite is built from, with the weight each carries.
 *
 * Weighted toward the medium window on purpose: a five-day lead is often one
 * gap that has not filled yet, while a sixty-day one is most of the history
 * NSE will hand over. Sixty is the longest window the ~70 bars that arrive can
 * actually support.
 */
export const RS_WINDOWS = [
  { days: 5, weight: 1 },
  { days: 20, weight: 2 },
  { days: 60, weight: 1 },
] as const;

export type RelativeStrengthRow = {
  symbol: string;
  returnPercent: number;
  rank: number;
  percentile: number;
};

/**
 * Ranks rows by return, best first. Purely a within-group ordering — "this
 * moved more than that, over the same window" — not a signal to act on.
 */
export function rankRelativeStrength(rows: Array<{ symbol: string; returnPercent: number }>): RelativeStrengthRow[] {
  const sorted = [...rows].sort((a, b) => b.returnPercent - a.returnPercent);
  const n = sorted.length;

  return sorted.map((row, index) => ({
    symbol: row.symbol,
    returnPercent: row.returnPercent,
    rank: index + 1,
    percentile: n > 1 ? ((n - 1 - index) / (n - 1)) * 100 : 100,
  }));
}

export type CompositeStrength = {
  symbol: string;
  /** Return per window, keyed by the window's length in sessions. Null where history runs out. */
  returns: Record<number, number | null>;
  /** Weighted mean of the windows that could be ranked, 0-100. Null when none could. */
  score: number | null;
};

/**
 * Rank a group over several windows at once and average the ranks.
 *
 * One window answers "who moved most since a date", which is a question about
 * that date as much as about the shares. Three windows, weighted, describe
 * something steadier: who has been ahead of this group and stayed there.
 * Still a within-group ordering, and still not a reason to buy anything.
 */
export function compositeRelativeStrength(
  entries: Array<{ symbol: string; closes: number[] }>,
): CompositeStrength[] {
  const percentiles = new Map<number, Map<string, number>>();

  for (const window of RS_WINDOWS) {
    const rows = entries
      .map((entry) => ({ symbol: entry.symbol, returnPercent: periodReturn(entry.closes, window.days) }))
      .filter((row): row is { symbol: string; returnPercent: number } => row.returnPercent != null);
    percentiles.set(window.days, new Map(rankRelativeStrength(rows).map((row) => [row.symbol, row.percentile])));
  }

  return entries.map((entry) => {
    let weighted = 0;
    let totalWeight = 0;
    const returns: Record<number, number | null> = {};

    for (const window of RS_WINDOWS) {
      returns[window.days] = periodReturn(entry.closes, window.days);
      const percentile = percentiles.get(window.days)?.get(entry.symbol);
      if (percentile == null) continue;
      weighted += percentile * window.weight;
      totalWeight += window.weight;
    }

    return { symbol: entry.symbol, returns, score: totalWeight > 0 ? weighted / totalWeight : null };
  });
}
