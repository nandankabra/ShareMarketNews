import type { Series } from "./types";

/**
 * Simple moving average. Returns a series the same length as the input, with
 * nulls until the window fills — aligning the result to the candles means a
 * caller never has to reason about an offset, which is where off-by-one bugs
 * in chart overlays come from.
 */
export function sma(values: number[], period: number): Series {
  if (period <= 0) throw new Error("sma: period must be positive");

  const out: Series = new Array(values.length).fill(null);
  let sum = 0;

  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }

  return out;
}

/**
 * Exponential moving average, seeded with the SMA of the first `period` values.
 * Seeding from the SMA rather than from the first value is what makes the
 * result match every charting package — starting at values[0] leaves a visible
 * distortion for the first fifty bars.
 */
export function ema(values: number[], period: number): Series {
  if (period <= 0) throw new Error("ema: period must be positive");

  const out: Series = new Array(values.length).fill(null);
  if (values.length < period) return out;

  const multiplier = 2 / (period + 1);

  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let previous = seed / period;
  out[period - 1] = previous;

  for (let i = period; i < values.length; i++) {
    previous = (values[i] - previous) * multiplier + previous;
    out[i] = previous;
  }

  return out;
}

/** The last non-null value of a series, or null if it never filled. */
export function last(series: Series): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] != null) return series[i];
  }
  return null;
}
