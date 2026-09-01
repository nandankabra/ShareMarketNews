/** Percent change from `days` trading sessions ago to the latest close. */
export function periodReturn(closes: number[], days: number): number | null {
  if (closes.length <= days) return null;
  const start = closes[closes.length - 1 - days];
  const end = closes[closes.length - 1];
  if (!start) return null;
  return ((end - start) / start) * 100;
}

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
