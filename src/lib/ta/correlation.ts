const MIN_OVERLAP = 10;
export const MAX_SESSIONS = 60;

/** Day-over-day percent changes; one shorter than the input. */
function returns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const previous = closes[i - 1];
    if (previous) out.push((closes[i] - previous) / previous);
  }
  return out;
}

/**
 * Pearson correlation of two equal-length series, or null when either is
 * constant (a zero-variance series has no defined correlation, not a zero
 * one) or too short to mean anything.
 */
export function pearsonCorrelation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < MIN_OVERLAP) return null;

  const x = a.slice(-n);
  const y = b.slice(-n);
  const meanX = x.reduce((sum, v) => sum + v, 0) / n;
  const meanY = y.reduce((sum, v) => sum + v, 0) / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

export type CorrelationMatrix = {
  symbols: string[];
  matrix: Array<Array<number | null>>;
};

/**
 * Pairwise correlation of daily returns across a set of symbols' closes.
 * Descriptive only — how closely two shares move together, not a
 * recommendation to hold or drop either one.
 */
export function correlationMatrix(series: Array<{ symbol: string; closes: number[] }>): CorrelationMatrix {
  const symbols = series.map((entry) => entry.symbol);
  const returnSeries = series.map((entry) => returns(entry.closes).slice(-MAX_SESSIONS));

  const matrix = returnSeries.map((row, i) =>
    returnSeries.map((col, j) => (i === j ? 1 : pearsonCorrelation(row, col))),
  );

  return { symbols, matrix };
}
