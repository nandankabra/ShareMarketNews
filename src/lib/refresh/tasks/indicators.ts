import { prisma } from "@/lib/prisma";
import { atr } from "@/lib/ta/atr";
import { computeLevels } from "@/lib/ta/levels";
import { macd } from "@/lib/ta/macd";
import { last, sma } from "@/lib/ta/moving-average";
import { rsi } from "@/lib/ta/rsi";
import { trendStateFrom } from "@/lib/ta/signals";
import type { Candle } from "@/lib/ta/types";

/**
 * Recompute every indicator for one share and denormalize the tail values onto
 * its row.
 *
 * Done here, once per day after the bars land, rather than per request. A
 * sector table of seventy rows would otherwise re-derive seventy 250-bar
 * series on every page view — and the support/resistance clustering is by some
 * margin the most expensive thing in the app.
 */
export async function recomputeIndicators(shareId: string): Promise<boolean> {
  const rows = await prisma.priceSnapshot.findMany({
    where: { shareId, interval: "DAILY" },
    orderBy: { at: "asc" },
    select: { at: true, open: true, high: true, low: true, close: true, volume: true },
  });

  // Below this there is nothing worth saying: RSI has not filled, ATR has not
  // filled, and levels computed from a handful of bars would be noise.
  if (rows.length < 30) return false;

  const candles: Candle[] = rows.map((row) => ({
    t: row.at.getTime(),
    o: row.open,
    h: row.high,
    l: row.low,
    c: row.close,
    v: row.volume,
  }));

  const closes = candles.map((candle) => candle.c);

  const rsiSeries = rsi(closes, 14);
  const atrSeries = atr(candles, 14);
  const sma20 = last(sma(closes, 20));
  const sma50 = last(sma(closes, 50));
  const sma200 = last(sma(closes, 200));
  const macdResult = macd(closes);

  const close = closes.at(-1) ?? null;
  const atrValue = last(atrSeries);

  const levels = computeLevels(candles, { spot: close ?? undefined });

  // Twenty sessions of realised movement — the baseline the notice rule
  // measures an "abnormal" day against.
  const recent = candles.slice(-21);
  const dailyMoves: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const previous = recent[i - 1].c;
    if (previous > 0) dailyMoves.push(Math.abs((recent[i].c - previous) / previous) * 100);
  }
  const avgAbsChangePercent20d = dailyMoves.length
    ? dailyMoves.reduce((total, value) => total + value, 0) / dailyMoves.length
    : null;

  const volumes = candles.slice(-20).map((candle) => candle.v ?? 0).filter((value) => value > 0);
  const avgVolume20d = volumes.length
    ? volumes.reduce((total, value) => total + value, 0) / volumes.length
    : null;

  await prisma.share.update({
    where: { id: shareId },
    data: {
      rsi14: last(rsiSeries),
      atr14: atrValue,
      atrPercent: atrValue != null && close ? (atrValue / close) * 100 : null,
      sma20,
      sma50,
      sma200,
      macdHist: last(macdResult.histogram),
      trendState: trendStateFrom(close, sma200),
      taAt: new Date(),
      levelsJson: JSON.stringify(levels),
      levelsAt: new Date(),
      avgAbsChangePercent20d,
      avgVolume20d,
      statsAt: new Date(),
      newsDayMovePct: JSON.stringify(await newsDayMoves(shareId, candles)),
    },
  });

  return true;
}

/**
 * How far this share moved on the days it was most in the news.
 *
 * The factual basis for "what does a story like this usually do to it" — and
 * deliberately its own history rather than any cross-sectional model. Days are
 * ranked by mention count, and the move on each is the close-to-close change.
 */
async function newsDayMoves(shareId: string, candles: Candle[]): Promise<number[]> {
  const mentions = await prisma.shareNewsMention.findMany({
    where: { shareId },
    select: { article: { select: { publishedAt: true } } },
  });

  if (mentions.length === 0) return [];

  const countByDay = new Map<string, number>();
  for (const mention of mentions) {
    const key = mention.article.publishedAt.toISOString().slice(0, 10);
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  const moveByDay = new Map<string, number>();
  for (let i = 1; i < candles.length; i++) {
    const previous = candles[i - 1].c;
    if (previous <= 0) continue;
    const key = new Date(candles[i].t).toISOString().slice(0, 10);
    moveByDay.set(key, Math.abs((candles[i].c - previous) / previous) * 100);
  }

  return [...countByDay.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([day]) => moveByDay.get(day))
    .filter((value): value is number => value != null);
}
