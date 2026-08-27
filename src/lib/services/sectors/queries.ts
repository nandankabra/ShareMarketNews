import "server-only";

import { addDaysIst, istToday } from "@/lib/date/ist";
import { prisma } from "@/lib/prisma";

export type SectorSummary = {
  key: string;
  name: string;
  displayName: string;
  lastLevel: number | null;
  lastChangePercent: number | null;
  levelAt: Date | null;
  constituentsSyncedAt: Date | null;
  memberCount: number;
  topGainer: { symbol: string; changePercent: number } | null;
  topLoser: { symbol: string; changePercent: number } | null;
};

/**
 * The sector grid.
 *
 * Memberships are loaded with their shares in one query rather than one query
 * per sector — sixteen sectors would otherwise be seventeen round trips before
 * the page renders anything.
 */
export async function listSectors(): Promise<SectorSummary[]> {
  const sectors = await prisma.sector.findMany({
    orderBy: { sortIndex: "asc" },
    include: {
      memberships: {
        select: { share: { select: { symbol: true, dayChangePercent: true } } },
      },
    },
  });

  return sectors.map((sector) => {
    const moved = sector.memberships
      .map((membership) => membership.share)
      .filter((share): share is { symbol: string; dayChangePercent: number } =>
        share.dayChangePercent != null,
      )
      .sort((a, b) => b.dayChangePercent - a.dayChangePercent);

    return {
      key: sector.key,
      name: sector.name,
      displayName: sector.displayName,
      lastLevel: sector.lastLevel,
      lastChangePercent: sector.lastChangePercent,
      levelAt: sector.levelAt,
      constituentsSyncedAt: sector.constituentsSyncedAt,
      memberCount: sector.memberships.length,
      topGainer: moved[0]
        ? { symbol: moved[0].symbol, changePercent: moved[0].dayChangePercent }
        : null,
      topLoser: moved.at(-1)
        ? { symbol: moved.at(-1)!.symbol, changePercent: moved.at(-1)!.dayChangePercent }
        : null,
    };
  });
}

export type ConstituentRow = {
  id: string;
  symbol: string;
  name: string;
  lastPrice: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  volume: number | null;
  quotedAt: Date | null;
  rsi14: number | null;
  newsCount: number;
  nextEvent: { eventDate: string; type: string } | null;
  inWatchlist: boolean;
};

export async function getSectorDetail(key: string) {
  const sector = await prisma.sector.findUnique({
    where: { key },
    include: {
      memberships: {
        include: { share: { include: { watchlist: true } } },
      },
    },
  });

  if (!sector) return null;

  const shareIds = sector.memberships.map((membership) => membership.shareId);
  const today = istToday();
  const horizon = addDaysIst(today, 7);
  const since48h = new Date(Date.now() - 48 * 60 * 60_000);

  // Two aggregate queries rather than two per share.
  const [newsCounts, events] = await Promise.all([
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

  const newsByShare = new Map(newsCounts.map((row) => [row.shareId, row._count._all]));
  const eventByShare = new Map<string, { eventDate: string; type: string }>();
  for (const event of events) {
    if (event.shareId && !eventByShare.has(event.shareId)) {
      eventByShare.set(event.shareId, { eventDate: event.eventDate, type: event.type });
    }
  }

  const rows: ConstituentRow[] = sector.memberships
    .map((membership) => {
      const share = membership.share;
      return {
        id: share.id,
        symbol: share.symbol,
        name: share.name,
        lastPrice: share.lastPrice,
        dayChange: share.dayChange,
        dayChangePercent: share.dayChangePercent,
        dayLow: share.dayLow,
        dayHigh: share.dayHigh,
        volume: share.volume,
        quotedAt: share.quotedAt,
        rsi14: share.rsi14,
        newsCount: newsByShare.get(share.id) ?? 0,
        nextEvent: eventByShare.get(share.id) ?? null,
        inWatchlist: share.watchlist != null,
      };
    })
    // Unquoted shares sort last rather than reading as a 0% day.
    .sort((a, b) => {
      if (a.dayChangePercent == null && b.dayChangePercent == null) return a.symbol.localeCompare(b.symbol);
      if (a.dayChangePercent == null) return 1;
      if (b.dayChangePercent == null) return -1;
      return b.dayChangePercent - a.dayChangePercent;
    });

  return {
    key: sector.key,
    name: sector.name,
    displayName: sector.displayName,
    lastLevel: sector.lastLevel,
    lastChangePercent: sector.lastChangePercent,
    levelAt: sector.levelAt,
    constituentsSyncedAt: sector.constituentsSyncedAt,
    rows,
  };
}

/**
 * Promote a sector's shares into refresh tier B.
 *
 * Fire-and-forget from the page: looking at a sector is the signal that its
 * prices are worth keeping fresh for the next couple of hours.
 */
export async function markSectorViewed(shareIds: string[]): Promise<void> {
  if (shareIds.length === 0) return;
  await prisma.share.updateMany({
    where: { id: { in: shareIds } },
    data: { lastViewedAt: new Date() },
  });
}
