import type { Candle } from "./types";

/** The average price a bar traded at, as far as one OHLC bar can say. */
function typicalPrice(candle: Candle): number {
  return (candle.h + candle.l + candle.c) / 3;
}

/**
 * Volume-weighted average price, accumulated from the first bar.
 *
 * The number every desk measures the session against: not where the price is,
 * but where the volume actually happened. A share can be up on the day and
 * still trading below the price most of its shares changed hands at.
 *
 * Aligned to the input, null until some volume has arrived — bars with no
 * volume field carry no weight rather than counting as zero, which would drag
 * the average toward whatever the last real trade was.
 */
export function vwapSeries(candles: Candle[]): Array<number | null> {
  const out: Array<number | null> = new Array(candles.length).fill(null);
  let volumeSum = 0;
  let valueSum = 0;

  for (let i = 0; i < candles.length; i++) {
    const volume = candles[i].v;
    if (volume != null && volume > 0) {
      volumeSum += volume;
      valueSum += typicalPrice(candles[i]) * volume;
    }
    if (volumeSum > 0) out[i] = valueSum / volumeSum;
  }

  return out;
}

/** The session's VWAP as it stands, or null when nothing has traded with volume. */
export function sessionVwap(candles: Candle[]): number | null {
  const series = vwapSeries(candles);
  return series[series.length - 1] ?? null;
}
