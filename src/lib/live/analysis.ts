import { atr } from "@/lib/ta/atr";
import { bollinger } from "@/lib/ta/bollinger";
import { lastCrossover, minOverWindow } from "@/lib/ta/crossover";
import { computeLevels, type LevelSet } from "@/lib/ta/levels";
import { macd } from "@/lib/ta/macd";
import { last, sma } from "@/lib/ta/moving-average";
import { rsi } from "@/lib/ta/rsi";
import type { Candle } from "@/lib/ta/types";

/**
 * Every indicator the app shows, computed from one array of bars.
 *
 * These used to be columns on the Share table, recomputed by a nightly task
 * after the bars landed, because clustering 250 bars of pivots on every page
 * load would have been the most expensive thing the app did. That reasoning was
 * about *repeating* the work per request — with the result cached alongside the
 * bars it came from, it happens about as often as the nightly task did.
 *
 * Pure, and deliberately not `server-only`: this is the half of the share page
 * that can be tested without a network or a database.
 */
export type Analysis = {
  close: number | null;
  previousClose: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
  rsi14: number | null;
  atr14: number | null;
  atrPercent: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  macdHist: number | null;
  bandwidth: number | null;
  bandwidthMin6m: number | null;
  crossDirection: "GOLDEN" | "DEATH" | null;
  crossAgeDays: number | null;
  avgVolume20d: number | null;
  avgAbsChangePercent20d: number | null;
  week52High: number | null;
  week52Low: number | null;
  levels: LevelSet | null;
};

/** Mean of the last `period` finite values, or null if there are none. */
function trailingMean(values: Array<number | null>, period: number): number | null {
  const usable = values.slice(-period).filter((value): value is number => value != null && Number.isFinite(value));
  if (usable.length === 0) return null;
  return usable.reduce((total, value) => total + value, 0) / usable.length;
}

export function analyse(candles: Candle[]): Analysis {
  const empty: Analysis = {
    close: null, previousClose: null, dayChange: null, dayChangePercent: null,
    rsi14: null, atr14: null, atrPercent: null,
    sma20: null, sma50: null, sma200: null, macdHist: null,
    bandwidth: null, bandwidthMin6m: null,
    crossDirection: null, crossAgeDays: null,
    avgVolume20d: null, avgAbsChangePercent20d: null,
    week52High: null, week52Low: null, levels: null,
  };

  if (candles.length === 0) return empty;

  const closes = candles.map((candle) => candle.c);
  const close = closes.at(-1) ?? null;
  const previousClose = closes.length > 1 ? (closes.at(-2) ?? null) : null;

  const sma20 = last(sma(closes, 20));
  const sma50Series = sma(closes, 50);
  const sma200Series = sma(closes, 200);

  const atrValue = last(atr(candles, 14));
  const bands = bollinger(closes, 20, 2);
  const cross = lastCrossover(sma50Series, sma200Series);

  // Day-over-day absolute moves, the baseline the notice rules compare against.
  const dailyMovePercents: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const previous = closes[i - 1];
    if (previous) dailyMovePercents.push(Math.abs(((closes[i] - previous) / previous) * 100));
  }

  // A 52-week window over daily bars, not the whole series: with more than a
  // year of history the plain max would quietly become an all-time high.
  const yearly = candles.slice(-250);

  const dayChange = close != null && previousClose != null ? close - previousClose : null;

  return {
    close,
    previousClose,
    dayChange,
    dayChangePercent: dayChange != null && previousClose ? (dayChange / previousClose) * 100 : null,
    rsi14: last(rsi(closes, 14)),
    atr14: atrValue,
    atrPercent: atrValue != null && close ? (atrValue / close) * 100 : null,
    sma20,
    sma50: last(sma50Series),
    sma200: last(sma200Series),
    macdHist: last(macd(closes).histogram),
    bandwidth: last(bands.bandwidth),
    // Six months of trading days, the window "squeeze" is defined over here.
    bandwidthMin6m: minOverWindow(bands.bandwidth, 126),
    crossDirection: cross?.direction ?? null,
    crossAgeDays: cross ? candles.length - 1 - cross.index : null,
    avgVolume20d: trailingMean(candles.map((candle) => candle.v), 20),
    avgAbsChangePercent20d: trailingMean(dailyMovePercents, 20),
    week52High: yearly.length ? Math.max(...yearly.map((candle) => candle.h)) : null,
    week52Low: yearly.length ? Math.min(...yearly.map((candle) => candle.l)) : null,
    // Needs enough history to find pivots worth clustering; below that the
    // "levels" would be noise dressed up as structure.
    levels: candles.length >= 30 ? computeLevels(candles, { spot: close ?? undefined }) : null,
  };
}
