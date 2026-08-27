import type { Series } from "./types";

/**
 * Relative Strength Index, using Wilder's smoothing.
 *
 * The smoothing is the part worth pinning in tests. The naive version — a plain
 * average of the last N gains and losses — produces plausible-looking numbers
 * that disagree with every broker's chart by several points, which is the worst
 * kind of wrong: not obviously broken, just quietly different. Wilder's method
 * seeds with a simple average over the first period and then carries the
 * average forward as `(previous * (period - 1) + current) / period`.
 */
export function rsi(closes: number[], period = 14): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gain += change;
    else loss -= change;
  }
  gain /= period;
  loss /= period;

  const toRsi = (avgGain: number, avgLoss: number): number =>
    avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  out[period] = toRsi(gain, loss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const up = change > 0 ? change : 0;
    const down = change < 0 ? -change : 0;
    gain = (gain * (period - 1) + up) / period;
    loss = (loss * (period - 1) + down) / period;
    out[i] = toRsi(gain, loss);
  }

  return out;
}
