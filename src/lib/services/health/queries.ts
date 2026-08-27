import "server-only";

import { SourceKey } from "@/lib/db/enums";
import { prisma } from "@/lib/prisma";

export type SourceHealth = {
  source: string;
  label: string;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  itemCount: number | null;
  durationMs: number | null;
  consecutiveFailures: number;
  nextEligibleAt: Date | null;
};

const LABELS: Record<string, string> = {
  NSE_MARKET_STATUS: "Market open/closed",
  NSE_ALL_INDICES: "Sector index levels",
  NSE_EQUITY_MASTER: "Index groupings",
  NSE_EVENT_CALENDAR: "Board meetings",
  NSE_CORPORATE_ACTIONS: "Dividends & ex-dates",
  NSE_OPTION_CHAIN: "Nifty option chain",
  NIFTY_CONSTITUENTS: "Sector constituents",
  YAHOO_QUOTES: "Share prices",
  YAHOO_DAILY_BARS: "Daily bars & indicators",
  BSE_QUOTES: "Fallback prices (BSE)",
  YAHOO_SEARCH: "Share search",
  GOOGLE_NEWS: "News headlines",
};

export async function listSourceHealth(): Promise<SourceHealth[]> {
  const rows = await prisma.sourceFetch.findMany();
  const bySource = new Map(rows.map((row) => [row.source, row]));

  return SourceKey.values.map((source) => {
    const row = bySource.get(source);
    return {
      source,
      label: LABELS[source] ?? source,
      lastAttemptAt: row?.lastAttemptAt ?? null,
      lastSuccessAt: row?.lastSuccessAt ?? null,
      lastStatus: row?.lastStatus ?? null,
      lastError: row?.lastError ?? null,
      itemCount: row?.itemCount ?? null,
      durationMs: row?.durationMs ?? null,
      consecutiveFailures: row?.consecutiveFailures ?? 0,
      nextEligibleAt: row?.nextEligibleAt ?? null,
    };
  });
}

export async function getUniverseStats() {
  const [sectors, shares, quoted, memberships, events, articles, mentions, chains, watchlist, oldestNews] =
    await Promise.all([
      prisma.sector.count(),
      prisma.share.count(),
      prisma.share.count({ where: { lastPrice: { not: null } } }),
      prisma.sectorMembership.count(),
      prisma.corporateEvent.count(),
      prisma.newsArticle.count(),
      prisma.shareNewsMention.count(),
      prisma.optionChainSnapshot.count(),
      prisma.watchlistItem.count(),
      prisma.newsArticle.findFirst({ orderBy: { publishedAt: "asc" }, select: { publishedAt: true } }),
    ]);

  return { sectors, shares, quoted, memberships, events, articles, mentions, chains, watchlist, oldestNews: oldestNews?.publishedAt ?? null };
}

/**
 * Has a poller checked in recently? Market status is the cheapest task and the
 * most frequent, so its last attempt is the best proxy for "something is
 * running" — distinct from "the data is fresh", which the sources table shows.
 */
export async function getPollerStatus() {
  const row = await prisma.sourceFetch.findUnique({ where: { source: "NSE_MARKET_STATUS" } });
  const lastAttemptAt = row?.lastAttemptAt ?? null;
  const running = lastAttemptAt != null && Date.now() - lastAttemptAt.getTime() < 5 * 60_000;
  return { running, lastAttemptAt };
}
