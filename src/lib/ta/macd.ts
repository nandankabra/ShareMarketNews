import { ema } from "./moving-average";
import type { Series } from "./types";

export type Macd = { macd: Series; signal: Series; histogram: Series };

/**
 * MACD. The signal line is an EMA of the MACD line, which only exists from the
 * slow period onward — so the signal EMA is computed over the compacted MACD
 * values and then scattered back to the original indices. Running the EMA over
 * an array padded with nulls-as-zeros is the usual bug here, and it drags the
 * first several signal values toward zero.
 */
export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): Macd {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);

  const macdLine: Series = closes.map((_, i) => {
    const f = fastEma[i];
    const s = slowEma[i];
    return f != null && s != null ? f - s : null;
  });

  const firstIndex = macdLine.findIndex((value) => value != null);
  const signal: Series = new Array(closes.length).fill(null);
  const histogram: Series = new Array(closes.length).fill(null);

  if (firstIndex === -1) return { macd: macdLine, signal, histogram };

  const compact = macdLine.slice(firstIndex) as number[];
  const compactSignal = ema(compact, signalPeriod);

  for (let i = 0; i < compactSignal.length; i++) {
    const value = compactSignal[i];
    if (value == null) continue;
    const index = firstIndex + i;
    signal[index] = value;
    const line = macdLine[index];
    if (line != null) histogram[index] = line - value;
  }

  return { macd: macdLine, signal, histogram };
}
