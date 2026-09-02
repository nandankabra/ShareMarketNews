/**
 * "The last stretch looked like this before, and here is what followed."
 *
 * A shape search, not a prediction. The function finds past windows whose
 * *shape* resembles the most recent one and reports what the series did in the
 * bars after each of them. It says nothing about what will happen next, and
 * deliberately returns the spread of outcomes rather than an average dressed up
 * as an expectation — four analogs that went +3, +2, -4 and -5 have a mean near
 * zero and a story that is anything but.
 *
 * Two details do most of the work here:
 *
 *  - Windows are compared as *returns*, correlated. A ₹90 share and a ₹2,400
 *    one can trace the same shape, and matching on price would never see it.
 *  - Chosen matches are kept apart by at least a window's width. Adjacent
 *    windows are nearly the same window, so without this a single episode is
 *    counted five times and reported as five pieces of evidence.
 */

export type AnalogMatch = {
  /** Index of the last bar of the matched window. */
  index: number;
  /** How alike the two shapes are, -1 to 1. */
  similarity: number;
  /** Percent change over the bars that followed the match. */
  followPercent: number;
};

export type AnalogStudy = {
  window: number;
  horizon: number;
  /** Windows examined — the denominator behind "we found four". */
  candidates: number;
  matches: AnalogMatch[];
  medianFollow: number | null;
  bestFollow: number | null;
  worstFollow: number | null;
  upCount: number;
  downCount: number;
};

export type AnalogOptions = {
  window: number;
  horizon: number;
  maxMatches?: number;
  minSimilarity?: number;
};

/** Bar-to-bar percent changes; one shorter than the input. */
function returns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const previous = closes[i - 1];
    out.push(previous ? ((closes[i] - previous) / previous) * 100 : 0);
  }
  return out;
}

/**
 * Correlation of two equal-length shapes.
 *
 * Deliberately not `pearsonCorrelation` from ./correlation: that one refuses
 * anything under ten overlapping points, which is right when the question is
 * "do these two shares move together" and wrong here, where a ten-bar pattern
 * is a perfectly ordinary thing to look for.
 */
function shapeCorrelation(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 3 || b.length !== n) return null;

  const meanA = a.reduce((sum, value) => sum + value, 0) / n;
  const meanB = b.reduce((sum, value) => sum + value, 0) / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }

  if (varA === 0 || varB === 0) return null;
  return cov / Math.sqrt(varA * varB);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function findAnalogs(closes: number[], options: AnalogOptions): AnalogStudy {
  const { window, horizon, maxMatches = 5, minSimilarity = 0.7 } = options;
  const empty: AnalogStudy = {
    window,
    horizon,
    candidates: 0,
    matches: [],
    medianFollow: null,
    bestFollow: null,
    worstFollow: null,
    upCount: 0,
    downCount: 0,
  };

  const n = closes.length;
  if (window < 4 || horizon < 1 || n < window * 2 + horizon) return empty;

  const current = returns(closes.slice(n - window));

  const scored: AnalogMatch[] = [];
  let candidates = 0;
  // A candidate window ends at `index`. It must have a full horizon of bars
  // after it, and must not overlap the window being matched — a pattern is
  // always perfectly similar to itself.
  for (let index = window - 1; index < n - window; index++) {
    if (index + horizon > n - 1) break;
    candidates++;

    const similarity = shapeCorrelation(current, returns(closes.slice(index - window + 1, index + 1)));
    if (similarity == null || similarity < minSimilarity) continue;

    const from = closes[index];
    const to = closes[index + horizon];
    if (!from) continue;

    scored.push({ index, similarity, followPercent: ((to - from) / from) * 100 });
  }

  // Best first, then thinned so no two chosen matches describe the same episode.
  scored.sort((a, b) => b.similarity - a.similarity);
  const matches: AnalogMatch[] = [];
  for (const match of scored) {
    if (matches.length >= maxMatches) break;
    if (matches.every((chosen) => Math.abs(chosen.index - match.index) >= window)) matches.push(match);
  }
  matches.sort((a, b) => a.index - b.index);

  const follows = matches.map((match) => match.followPercent);
  return {
    window,
    horizon,
    candidates,
    matches,
    medianFollow: median(follows),
    bestFollow: follows.length > 0 ? Math.max(...follows) : null,
    worstFollow: follows.length > 0 ? Math.min(...follows) : null,
    upCount: follows.filter((value) => value > 0).length,
    downCount: follows.filter((value) => value < 0).length,
  };
}
