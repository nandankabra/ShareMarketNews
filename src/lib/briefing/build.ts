import { addDaysIst, istToday } from "@/lib/date/ist";
import { analyse } from "@/lib/live/analysis";
import { resolveShare } from "@/lib/live/directory";
import { liveEvents, liveHistory, liveNews } from "@/lib/live/sources";
import { CATEGORY_LABEL, classifyHeadline } from "@/lib/news/classify";
import { isRelevantHeadline } from "@/lib/news/relevance";
import { isWatchlistOnly, scoreNotice, type NoticeResult } from "@/lib/notice/score";
import type { Candle } from "@/lib/ta/types";
import { readWatchlist } from "@/lib/watchlist/store";

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
 * How much one briefing render may spend upstream.
 *
 * The old version scored the whole universe, because the poller had already
 * collected everything it needed and the scan was a database query. Now each
 * candidate costs a request, so the candidate set has to be chosen before the
 * work rather than filtered after it.
 *
 * Both numbers are sized against the function timeout on a cold cache: NSE is
 * held to a 2s gap and Google News to 3s, so this is roughly 16s of bars and
 * 12s of headlines. Warm, it is nearly free.
 */
const CANDIDATE_BUDGET = 8;
const NEWS_BUDGET = 4;

/**
 * Assemble the briefing.
 *
 * Deliberately not `server-only`: the guard belongs on the service layer that
 * pages import, and scripts need to call this without pretending to be a React
 * render. The scorer itself is pure and lives in src/lib/notice/score.ts; this
 * gathers its inputs.
 *
 * Candidates are shares with a dated corporate event in the next three days,
 * plus whatever is on your watchlist. That is the honest version of "only
 * shares with something to say": a share with no event and no news cannot
 * score, and without a database there is no way to notice an unusual move
 * across four hundred shares without asking about all four hundred.
 */
export async function getBriefing(): Promise<Briefing> {
  const today = istToday();
  const tomorrow = addDaysIst(today, 1);
  const dayAfter = addDaysIst(today, 2);

  const [events, watchlist] = [await liveEvents(), await readWatchlist()];
  const watchedSymbols = new Set(watchlist.map((entry) => entry.symbol));

  const upcoming = (events.ok ? events.data : []).filter(
    (event) => event.eventDate >= today && event.eventDate <= dayAfter,
  );

  // Watchlist first: your own shares should never be crowded out of the budget
  // by an unfamiliar company holding a board meeting.
  const ordered: string[] = [
    ...watchedSymbols,
    ...upcoming.map((event) => event.symbol.toUpperCase()),
  ];
  const candidates = [...new Set(ordered)].slice(0, CANDIDATE_BUDGET);

  const entries: BriefingEntry[] = [];
  let newsSpent = 0;

  for (const symbol of candidates) {
    const identity = await resolveShare(symbol);
    const history = await liveHistory(symbol);

    const candles: Candle[] = history.ok
      ? history.data.map((bar) => ({
          t: new Date(`${bar.day}T00:00:00.000Z`).getTime(),
          o: bar.open, h: bar.high, l: bar.low, c: bar.close, v: bar.volume,
        }))
      : [];

    const ta = analyse(candles);
    const lastBar = history.ok ? history.data.at(-1) : undefined;

    const shareEvents = upcoming
      .filter((event) => event.symbol.toUpperCase() === symbol)
      .map((event) => ({
        eventDate: event.eventDate,
        type: event.type,
        description: event.description,
      }));

    // Headlines are the scarcest budget, so they go to shares that already have
    // a reason to be here rather than being spread thinly over all of them.
    let topStory: BriefingEntry["topStory"] = null;
    let newsCount24h = 0;
    let newsCount48h = 0;

    if (newsSpent < NEWS_BUDGET) {
      newsSpent += 1;
      const news = await liveNews(identity.name);
      if (news.ok) {
        const relevant = news.data.filter((item) =>
          isRelevantHeadline(item.title, identity.name, symbol),
        );
        const now = Date.now();
        newsCount24h = relevant.filter((item) => now - item.publishedAt < 24 * 3_600_000).length;
        newsCount48h = relevant.filter((item) => now - item.publishedAt < 48 * 3_600_000).length;

        const newest = relevant[0];
        if (newest) {
          const classification = classifyHeadline(newest.title);
          topStory = {
            title: newest.title,
            url: newest.url,
            source: newest.source,
            publishedAt: new Date(newest.publishedAt),
            firstSeenAt: new Date(newest.publishedAt),
            categoryLabel: CATEGORY_LABEL[classification.category],
            polarity: classification.polarity,
          };
        }
      }
    }

    const notice = scoreNotice(
      {
        symbol,
        events: shareEvents,
        newsCount24h,
        newsCount48h,
        dayChangePercent: ta.dayChangePercent,
        avgAbsChangePercent20d: ta.avgAbsChangePercent20d,
        volume: lastBar?.volume ?? null,
        avgVolume20d: ta.avgVolume20d,
        inWatchlist: watchedSymbols.has(symbol),
      },
      today,
      tomorrow,
      dayAfter,
    );

    // LOW is "nothing worth interrupting you for" — scored, then dropped.
    if (notice.band === "LOW") continue;

    const nextEvent = upcoming
      .filter((event) => event.symbol.toUpperCase() === symbol)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0];

    entries.push({
      notice,
      share: {
        id: symbol,
        symbol,
        name: identity.name,
        lastPrice: ta.close,
        dayChangePercent: ta.dayChangePercent,
        quotedAt: lastBar ? new Date(`${lastBar.day}T00:00:00.000Z`) : null,
        rsi14: ta.rsi14,
      },
      topStory,
      nextEvent: nextEvent
        ? { eventDate: nextEvent.eventDate, type: nextEvent.type, description: nextEvent.description }
        : null,
    });
  }

  entries.sort((a, b) => b.notice.score - a.notice.score);

  const watchlistOnly = entries.filter((entry) => isWatchlistOnly(entry.notice));
  const scored = entries.filter((entry) => !isWatchlistOnly(entry.notice));

  const happeningToday = scored.filter((entry) => entry.nextEvent?.eventDate === today);
  const tomorrowEntries = scored.filter((entry) => entry.nextEvent?.eventDate === tomorrow);
  const rest = scored.filter(
    (entry) => !happeningToday.includes(entry) && !tomorrowEntries.includes(entry),
  );

  return {
    today,
    tomorrow,
    happeningToday,
    tomorrowEntries,
    movingOrInNews: rest,
    fromWatchlist: watchlistOnly,
    eventsAvailable: events.ok,
    scanned: candidates.length,
  };
}

/**
 * What the briefing polls for, every thirty seconds.
 *
 * "Fresh" is measured from a story's published time. With a database this
 * compared against `firstSeenAt` — when *we* first saw it — which is the more
 * honest definition of new-to-you and the one that let a marker decay
 * gracefully. Nothing here can reconstruct that, so a story published three
 * hours ago and discovered just now reads as three hours old.
 *
 * Scoped to the watchlist, which is the set you actually want interrupting you,
 * and bounded so a poll never becomes a burst.
 */
export async function getNewsPulse(): Promise<{ newestFirstSeenAt: Date | null; freshCount: number }> {
  const watchlist = (await readWatchlist()).slice(0, NEWS_BUDGET);
  if (watchlist.length === 0) return { newestFirstSeenAt: null, freshCount: 0 };

  const cutoff = Date.now() - 24 * 3_600_000;
  let newest: number | null = null;
  let fresh = 0;

  for (const entry of watchlist) {
    const identity = await resolveShare(entry.symbol);
    const news = await liveNews(identity.name);
    if (!news.ok) continue;

    for (const item of news.data) {
      if (!isRelevantHeadline(item.title, identity.name, entry.symbol)) continue;
      if (item.publishedAt > cutoff) fresh += 1;
      if (newest == null || item.publishedAt > newest) newest = item.publishedAt;
    }
  }

  return { newestFirstSeenAt: newest != null ? new Date(newest) : null, freshCount: fresh };
}
