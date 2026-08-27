import "server-only";

import { addDaysIst, istToday } from "@/lib/date/ist";
import { prisma } from "@/lib/prisma";

export type WatchlistRow = {
  shareId: string;
  symbol: string;
  name: string;
  note: string | null;
  addedAt: Date;
  addedPrice: number | null;
  lastPrice: number | null;
  dayChangePercent: number | null;
  quotedAt: Date | null;
  rsi14: number | null;
  /** Return since you added it — measured from the price you noticed it at. */
  sinceAddedPercent: number | null;
  spark: number[];
  newsCount: number;
  nextEvent: { eventDate: string; type: string } | null;
};

export async function listWatchlist(): Promise<WatchlistRow[]> {
  const items = await prisma.watchlistItem.findMany({
    orderBy: [{ sortIndex: "asc" }, { addedAt: "asc" }],
    include: { share: true },
  });

  if (items.length === 0) return [];

  const shareIds = items.map((item) => item.shareId);
  const today = istToday();
  const horizon = addDaysIst(today, 30);
  const since48h = new Date(Date.now() - 48 * 60 * 60_000);
  const since30d = new Date(Date.now() - 30 * 86_400_000);

  const [bars, newsCounts, events] = await Promise.all([
    prisma.priceSnapshot.findMany({
      where: { shareId: { in: shareIds }, interval: "DAILY", at: { gte: since30d } },
      orderBy: { at: "asc" },
      select: { shareId: true, close: true },
    }),
    prisma.shareNewsMention.groupBy({
      by: ["shareId"],
      where: { shareId: { in: shareIds }, article: { publishedAt: { gte: since48h } } },
      _count: { _all: true },
    }),
    prisma.corporateEvent.findMany({
      where: { shareId: { in: shareIds }, eventDate: { gte: today, lte: horizon } },
      orderBy: { eventDate: "asc" },
      select: { shareId: true, eventDate: true, type: true },
    }),
  ]);

  const sparkByShare = new Map<string, number[]>();
  for (const bar of bars) {
    const list = sparkByShare.get(bar.shareId) ?? [];
    list.push(bar.close);
    sparkByShare.set(bar.shareId, list);
  }

  const newsByShare = new Map(newsCounts.map((row) => [row.shareId, row._count._all]));
  const eventByShare = new Map<string, { eventDate: string; type: string }>();
  for (const event of events) {
    if (event.shareId && !eventByShare.has(event.shareId)) {
      eventByShare.set(event.shareId, { eventDate: event.eventDate, type: event.type });
    }
  }

  return items.map((item) => {
    const share = item.share;
    return {
      shareId: item.shareId,
      symbol: share.symbol,
      name: share.name,
      note: item.note,
      addedAt: item.addedAt,
      addedPrice: item.addedPrice,
      lastPrice: share.lastPrice,
      dayChangePercent: share.dayChangePercent,
      quotedAt: share.quotedAt,
      rsi14: share.rsi14,
      sinceAddedPercent:
        item.addedPrice && item.addedPrice > 0 && share.lastPrice != null
          ? ((share.lastPrice - item.addedPrice) / item.addedPrice) * 100
          : null,
      spark: sparkByShare.get(item.shareId) ?? [],
      newsCount: newsByShare.get(item.shareId) ?? 0,
      nextEvent: eventByShare.get(item.shareId) ?? null,
    };
  });
}

export type SearchHitRow = {
  symbol: string;
  name: string;
  sector: string | null;
  tracked: boolean;
  inWatchlist: boolean;
};

/**
 * Search the shares already loaded from the index files first.
 *
 * Local-first rather than provider-first, and not only because the provider
 * keeps rate-limiting us: the universe already holds every constituent of every
 * tracked sector, which is what you are almost always reaching for. Going out
 * to the network for "TCS" would be slower and worse. The provider is the
 * fallback for a share outside the universe entirely.
 */
export async function searchLocalShares(query: string, limit = 8): Promise<SearchHitRow[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const shares = await prisma.share.findMany({
    where: {
      OR: [{ symbol: { contains: term } }, { name: { contains: term } }],
    },
    take: limit,
    include: {
      watchlist: { select: { id: true } },
      memberships: { take: 1, include: { sector: { select: { displayName: true } } } },
    },
  });

  const upper = term.toUpperCase();

  return shares
    .map((share) => ({
      symbol: share.symbol,
      name: share.name,
      sector: share.memberships[0]?.sector.displayName ?? share.yahooSector ?? null,
      tracked: true,
      inWatchlist: share.watchlist != null,
    }))
    // An exact ticker match is what someone typing "TCS" means.
    .sort((a, b) => {
      const aExact = a.symbol === upper ? 0 : a.symbol.startsWith(upper) ? 1 : 2;
      const bExact = b.symbol === upper ? 0 : b.symbol.startsWith(upper) ? 1 : 2;
      return aExact - bExact || a.symbol.localeCompare(b.symbol);
    });
}
