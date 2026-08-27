import type { Series } from "./types";

export type Crossover = { direction: "GOLDEN" | "DEATH"; index: number };

/**
 * The most recent crossing of a fast average over a slow one.
 *
 * Walks backwards and stops at the first crossing, because only the latest one
 * is interesting — "the 50-day crossed below the 200-day six days ago" is a
 * fact about now, whereas the crossing before it is history.
 *
 * Both series must be aligned to the same candle indices, which is why the
 * moving-average helpers pad with nulls rather than returning a shorter array.
 */
export function lastCrossover(fast: Series, slow: Series): Crossover | null {
  for (let i = fast.length - 1; i > 0; i--) {
    const fastNow = fast[i];
    const slowNow = slow[i];
    const fastPrev = fast[i - 1];
    const slowPrev = slow[i - 1];

    if (fastNow == null || slowNow == null || fastPrev == null || slowPrev == null) continue;

    const wasAbove = fastPrev > slowPrev;
    const isAbove = fastNow > slowNow;
    if (wasAbove === isAbove) continue;

    return { direction: isAbove ? "GOLDEN" : "DEATH", index: i };
  }

  return null;
}

/**
 * The lowest bandwidth over a trailing window — the baseline a squeeze is
 * judged against. Nulls are skipped rather than treated as zero, which would
 * make every series look permanently squeezed.
 */
export function minOverWindow(series: Series, window: number): number | null {
  const slice = series.slice(-window);
  let best: number | null = null;
  for (const value of slice) {
    if (value == null) continue;
    if (best == null || value < best) best = value;
  }
  return best;
}
