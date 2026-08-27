import "server-only";

import { addDaysIst, istToday } from "@/lib/date/ist";
import { CATEGORY_LABEL } from "@/lib/news/classify";
import { summariseReaction, type Reaction } from "@/lib/news/reaction";
import { prisma } from "@/lib/prisma";
import { buildSignals, type Signal } from "@/lib/ta/signals";
import type { Level, LevelSet } from "@/lib/ta/levels";

export type ShareCandle = { time: string; open: number; high: number; low: number; close: number; volume: number | null };

export type ShareDetail = {
  id: string;
  symbol: string;
  name: string;
  isin: string | null;
  sectors: { key: string; displayName: string }[];
  yahooSector: string | null;
  lastPrice: number | null;
  previousClose: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  week52High: number | null;
  week52Low: number | null;
  volume: number | null;
  quotedAt: Date | null;
  rsi14: number | null;
  atr14: number | null;
  atrPercent: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  avgVolume20d: number | null;
  avgAbsChangePercent20d: number | null;
  taAt: Date | null;
  inWatchlist: boolean;
  candles: ShareCandle[];
  levels: LevelSet | null;
  signals: Signal[];
  reaction: Reaction;
  news: {
    id: string;
    title: string;
    url: string;
    source: string | null;
    publishedAt: Date;
    firstSeenAt: Date;
    category: string | null;
    categoryLabel: string;
    polarity: string | null;
    matchedTerms: string | null;
  }[];
  events: { eventDate: string; type: string; description: string; upcoming: boolean }[];
};

function parseLevels(json: string | null): LevelSet | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as LevelSet;
  } catch {
    // A malformed cache is a reason to show no levels, not to fail the page.
    return null;
  }
}

function parseMoves(json: string | null): number[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === "number") : [];
  } catch {
    return [];
  }
}

function nearest(levels: Level[] | undefined, spot: number | null, side: "SUPPORT" | "RESISTANCE"): Level | null {
  if (!levels || spot == null) return null;
  const candidates = levels.filter((level) => (side === "SUPPORT" ? level.price < spot : level.price >= spot));
  if (candidates.length === 0) return null;
  return candidates.reduce((closest, level) =>
    Math.abs(level.price - spot) < Math.abs(closest.price - spot) ? level : closest,
  );
}

export async function getShareDetail(symbol: string): Promise<ShareDetail | null> {
  const share = await prisma.share.findUnique({
    where: { symbol: symbol.toUpperCase() },
    include: {
      watchlist: true,
      memberships: { include: { sector: { select: { key: true, displayName: true } } } },
    },
  });

  if (!share) return null;

  const today = istToday();
  const horizon = addDaysIst(today, 120);
  const past = addDaysIst(today, -30);

  const [snapshots, mentions, events] = await Promise.all([
    prisma.priceSnapshot.findMany({
      where: { shareId: share.id, interval: "DAILY" },
      orderBy: { at: "asc" },
      select: { at: true, open: true, high: true, low: true, close: true, volume: true },
    }),
    prisma.shareNewsMention.findMany({
      where: { shareId: share.id },
      orderBy: { article: { publishedAt: "desc" } },
      take: 25,
      include: { article: true },
    }),
    prisma.corporateEvent.findMany({
      where: { shareId: share.id, eventDate: { gte: past, lte: horizon } },
      orderBy: { eventDate: "asc" },
    }),
  ]);

  const levels = parseLevels(share.levelsJson);
  const bandwidth = null; // Bollinger squeeze needs a 6-month baseline; P5.

  const signals = buildSignals({
    close: share.lastPrice,
    rsi14: share.rsi14,
    sma20: share.sma20,
    sma50: share.sma50,
    sma200: share.sma200,
    macdHist: share.macdHist,
    atrPercent: share.atrPercent,
    volume: share.volume,
    avgVolume20d: share.avgVolume20d,
    week52High: share.week52High,
    week52Low: share.week52Low,
    bandwidth,
    bandwidthMin6m: null,
    crossAgeDays: null,
    crossDirection: null,
    nearestSupport: nearest(levels?.supports, share.lastPrice, "SUPPORT"),
    nearestResistance: nearest(levels?.resistances, share.lastPrice, "RESISTANCE"),
  });

  return {
    id: share.id,
    symbol: share.symbol,
    name: share.name,
    isin: share.isin,
    sectors: share.memberships.map((membership) => membership.sector),
    yahooSector: share.yahooSector,
    lastPrice: share.lastPrice,
    previousClose: share.previousClose,
    dayChange: share.dayChange,
    dayChangePercent: share.dayChangePercent,
    dayHigh: share.dayHigh,
    dayLow: share.dayLow,
    week52High: share.week52High,
    week52Low: share.week52Low,
    volume: share.volume,
    quotedAt: share.quotedAt,
    rsi14: share.rsi14,
    atr14: share.atr14,
    atrPercent: share.atrPercent,
    sma20: share.sma20,
    sma50: share.sma50,
    sma200: share.sma200,
    avgVolume20d: share.avgVolume20d,
    avgAbsChangePercent20d: share.avgAbsChangePercent20d,
    taAt: share.taAt,
    inWatchlist: share.watchlist != null,
    candles: snapshots.map((row) => ({
      // lightweight-charts wants a plain calendar date for daily series.
      time: row.at.toISOString().slice(0, 10),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    })),
    levels,
    signals,
    reaction: summariseReaction({
      newsDayMoves: parseMoves(share.newsDayMovePct),
      avgAbsChangePercent20d: share.avgAbsChangePercent20d,
      atrPercent: share.atrPercent,
    }),
    news: mentions.map((mention) => ({
      id: mention.article.id,
      title: mention.article.title,
      url: mention.article.url,
      source: mention.article.source,
      publishedAt: mention.article.publishedAt,
      firstSeenAt: mention.article.firstSeenAt,
      category: mention.article.category,
      categoryLabel:
        CATEGORY_LABEL[(mention.article.category ?? "OTHER") as keyof typeof CATEGORY_LABEL] ?? "General",
      polarity: mention.article.polarity,
      matchedTerms: mention.article.matchedTerms,
    })),
    events: events.map((event) => ({
      eventDate: event.eventDate,
      type: event.type,
      description: event.description,
      upcoming: event.eventDate >= today,
    })),
  };
}

/** Symbols for generateStaticParams-style listings and the 404 path. */
export async function shareExists(symbol: string): Promise<boolean> {
  const count = await prisma.share.count({ where: { symbol: symbol.toUpperCase() } });
  return count > 0;
}
