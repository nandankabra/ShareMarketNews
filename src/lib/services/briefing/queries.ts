import "server-only";

import { addDaysIst, istToday } from "@/lib/date/ist";
import { CATEGORY_LABEL } from "@/lib/news/classify";
import { isWatchlistOnly, scoreNotice, type NoticeResult } from "@/lib/notice/score";
import { prisma } from "@/lib/prisma";
import type { CorporateEventType } from "@/lib/db/enums";

export type BriefingEntry = {
  notice: NoticeResult;
  share: {
    id: string;
    symbol: string;
    name: string;
    lastPrice: number | null;
    dayChangePercent: number | null;
    quotedAt: Date | null;
    rsi14: number | null;
  };
  topStory: {
    title: string;
    url: string;
    source: string | null;
    publishedAt: Date;
    firstSeenAt: Date;
    categoryLabel: string;
    polarity: string | null;
  } | null;
  nextEvent: { eventDate: string; type: string; description: string } | null;
};

export type Briefing = {
  today: string;
  tomorrow: string;
  happeningToday: BriefingEntry[];
  tomorrowEntries: BriefingEntry[];
  movingOrInNews: BriefingEntry[];
  fromWatchlist: BriefingEntry[];
  eventsAvailable: boolean;
  scanned: number;
};

/**
 * Assemble the briefing.
 *
 * The scorer itself is pure and lives in src/lib/notice/score.ts; this is the
 * part that gathers its inputs. Only shares with something to say are
 * considered — a share with no event, no news and no unusual move cannot score,
 * so loading all four hundred to run the rule over them would be waste.
 */
export async function getBriefing(): Promise<Briefing> {
  const today = istToday();
  const tomorrow = addDaysIst(today, 1);
  const dayAfter = addDaysIst(today, 2);

  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60_000);
  const since48h = new Date(now - 48 * 60 * 60_000);

  const [events, recentMentions, watchlist, eventSource] = await Promise.all([
    prisma.corporateEvent.findMany({
      where: { eventDate: { in: [today, tomorrow, dayAfter] }, shareId: { not: null } },
      orderBy: { eventDate: "asc" },
    }),
    prisma.shareNewsMention.findMany({
      where: { article: { publishedAt: { gte: since48h } } },
      include: { article: true },
      orderBy: { article: { publishedAt: "desc" } },
    }),
    prisma.watchlistItem.findMany({ select: { shareId: true } }),
    prisma.sourceFetch.findUnique({ where: { source: "NSE_EVENT_CALENDAR" } }),
  ]);

  const watchlistIds = new Set(watchlist.map((item) => item.shareId));

  // Candidates: anything with a dated event, any share in the news, anything
  // watched. Everything else cannot score above zero.
  const candidateIds = new Set<string>();
  for (const event of events) if (event.shareId) candidateIds.add(event.shareId);
  for (const mention of recentMentions) candidateIds.add(mention.shareId);
  for (const id of watchlistIds) candidateIds.add(id);

  // A share can also qualify on movement alone, but only where a baseline
  // exists to call the move abnormal against.
  const movers = await prisma.share.findMany({
    where: {
      dayChangePercent: { not: null },
      avgAbsChangePercent20d: { not: null, gt: 0 },
    },
    select: { id: true, dayChangePercent: true, avgAbsChangePercent20d: true },
  });
  for (const mover of movers) {
    if (Math.abs(mover.dayChangePercent!) >= mover.avgAbsChangePercent20d! * 2) {
      candidateIds.add(mover.id);
    }
  }

  if (candidateIds.size === 0) {
    return {
      today,
      tomorrow,
      happeningToday: [],
      tomorrowEntries: [],
      movingOrInNews: [],
      fromWatchlist: [],
      eventsAvailable: eventSource?.lastStatus === "OK",
      scanned: 0,
    };
  }

  const shares = await prisma.share.findMany({
    where: { id: { in: [...candidateIds] } },
    select: {
      id: true, symbol: true, name: true, lastPrice: true, dayChangePercent: true,
      quotedAt: true, rsi14: true, volume: true, avgVolume20d: true,
      avgAbsChangePercent20d: true,
    },
  });

  const eventsByShare = new Map<string, typeof events>();
  for (const event of events) {
    if (!event.shareId) continue;
    const list = eventsByShare.get(event.shareId) ?? [];
    list.push(event);
    eventsByShare.set(event.shareId, list);
  }

  const mentionsByShare = new Map<string, typeof recentMentions>();
  for (const mention of recentMentions) {
    const list = mentionsByShare.get(mention.shareId) ?? [];
    list.push(mention);
    mentionsByShare.set(mention.shareId, list);
  }

  const entries: BriefingEntry[] = [];

  for (const share of shares) {
    const shareEvents = eventsByShare.get(share.id) ?? [];
    const shareMentions = mentionsByShare.get(share.id) ?? [];

    const news24h = shareMentions.filter((mention) => mention.article.publishedAt >= since24h);
    const news48h = shareMentions.filter((mention) => mention.article.publishedAt < since24h);

    const notice = scoreNotice(
      {
        symbol: share.symbol,
        events: shareEvents.map((event) => ({
          type: event.type as CorporateEventType,
          eventDate: event.eventDate,
          recordDate: event.recordDate,
          description: event.description,
        })),
        newsCount24h: news24h.length,
        newsCount48h: news48h.length,
        dayChangePercent: share.dayChangePercent,
        avgAbsChangePercent20d: share.avgAbsChangePercent20d,
        volume: share.volume,
        avgVolume20d: share.avgVolume20d,
        inWatchlist: watchlistIds.has(share.id),
      },
      today,
      tomorrow,
      dayAfter,
    );

    if (notice.band === "LOW") continue;

    const top = shareMentions[0];
    entries.push({
      notice,
      share: {
        id: share.id,
        symbol: share.symbol,
        name: share.name,
        lastPrice: share.lastPrice,
        dayChangePercent: share.dayChangePercent,
        quotedAt: share.quotedAt,
        rsi14: share.rsi14,
      },
      topStory: top
        ? {
            title: top.article.title,
            url: top.article.url,
            source: top.article.source,
            publishedAt: top.article.publishedAt,
            firstSeenAt: top.article.firstSeenAt,
            categoryLabel:
              CATEGORY_LABEL[(top.article.category ?? "OTHER") as keyof typeof CATEGORY_LABEL] ?? "General",
            polarity: top.article.polarity,
          }
        : null,
      nextEvent: shareEvents[0]
        ? {
            eventDate: shareEvents[0].eventDate,
            type: shareEvents[0].type,
            description: shareEvents[0].description,
          }
        : null,
    });
  }

  entries.sort((a, b) => b.notice.score - a.notice.score);

  // A share whose only reason is being watched goes in its own section, or the
  // briefing fills up with things that are doing nothing.
  const watchlistOnly = entries.filter((entry) => isWatchlistOnly(entry.notice));
  const rest = entries.filter((entry) => !isWatchlistOnly(entry.notice));

  const happeningToday = rest.filter(
    (entry) => entry.notice.eventDriven && entry.nextEvent?.eventDate === today,
  );
  const tomorrowEntries = rest.filter(
    (entry) => entry.notice.eventDriven && entry.nextEvent?.eventDate === tomorrow,
  );
  const claimed = new Set([...happeningToday, ...tomorrowEntries]);
  const movingOrInNews = rest.filter((entry) => !claimed.has(entry));

  return {
    today,
    tomorrow,
    happeningToday,
    tomorrowEntries,
    movingOrInNews,
    fromWatchlist: watchlistOnly,
    eventsAvailable: eventSource?.lastStatus === "OK",
    scanned: candidateIds.size,
  };
}

/** Cheap payload for the live-news poll. */
export async function getNewsPulse() {
  const newest = await prisma.newsArticle.findFirst({
    orderBy: { firstSeenAt: "desc" },
    select: { firstSeenAt: true },
  });
  const count = await prisma.newsArticle.count({
    where: { firstSeenAt: { gte: new Date(Date.now() - 30 * 60_000) } },
  });
  return { newestFirstSeenAt: newest?.firstSeenAt ?? null, freshCount: count };
}
