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

export type CorrelationPair = { a: string; b: string; value: number };

export type CorrelationMatrix = {
  symbols: string[];
  matrix: Array<Array<number | null>>;
  /** Mean of every off-diagonal pair that could be measured, or null when none could. */
  average: number | null;
  /** The pair that moves together most, and the pair that moves together least. */
  closest: CorrelationPair | null;
  loosest: CorrelationPair | null;
};

/**
 * Order symbols so that things which move together sit next to each other.
 *
 * Greedy seriation: start from the closest pair and keep appending whichever
 * symbol is most correlated with the one just placed. Not a dendrogram, and it
 * does not pretend to be — but it turns a matrix whose blocks are scattered
 * across the grid into one where they are visible, which is the entire reason
 * to draw the grid rather than a list.
 */
function clusterOrder(symbols: string[], matrix: Array<Array<number | null>>): number[] {
  if (symbols.length < 3) return symbols.map((_, index) => index);

  let seedA = 0;
  let seedB = 1;
  let best = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const value = matrix[i][j];
      if (value != null && value > best) {
        best = value;
        seedA = i;
        seedB = j;
      }
    }
  }

  const order = [seedA, seedB];
  const placed = new Set(order);

  while (order.length < symbols.length) {
    const last = order[order.length - 1];
    let next = -1;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < symbols.length; i++) {
      if (placed.has(i)) continue;
      // An unmeasurable pair sorts last rather than blocking the walk.
      const value = matrix[last][i] ?? Number.NEGATIVE_INFINITY;
      if (next === -1 || value > bestValue) {
        bestValue = value;
        next = i;
      }
    }
    order.push(next);
    placed.add(next);
  }

  return order;
}

function summarise(symbols: string[], matrix: Array<Array<number | null>>) {
  const pairs: CorrelationPair[] = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const value = matrix[i][j];
      if (value != null) pairs.push({ a: symbols[i], b: symbols[j], value });
    }
  }

  if (pairs.length === 0) return { average: null, closest: null, loosest: null };

  return {
    average: pairs.reduce((sum, pair) => sum + pair.value, 0) / pairs.length,
    closest: pairs.reduce((best, pair) => (pair.value > best.value ? pair : best)),
    loosest: pairs.reduce((worst, pair) => (pair.value < worst.value ? pair : worst)),
  };
}

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

  // Rows and columns are reordered together, so the diagonal stays the
  // diagonal and every cell keeps the pair it belonged to.
  const order = clusterOrder(symbols, matrix);
  const ordered = order.map((i) => symbols[i]);
  const orderedMatrix = order.map((i) => order.map((j) => matrix[i][j]));

  return { symbols: ordered, matrix: orderedMatrix, ...summarise(ordered, orderedMatrix) };
}
