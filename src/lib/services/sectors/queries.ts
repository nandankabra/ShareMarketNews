import "server-only";

import { liveConstituents, liveIndices, liveQuote } from "@/lib/live/sources";
import { SECTOR_CATALOGUE } from "@/lib/sectors/catalogue";

export type SectorSummary = {
  key: string;
  name: string;
  displayName: string;
  lastLevel: number | null;
  lastChangePercent: number | null;
  levelAt: Date | null;
  /** Null means "not counted", which is different from a sector of zero. */
  memberCount: number | null;
  topGainer: { symbol: string; changePercent: number } | null;
  topLoser: { symbol: string; changePercent: number } | null;
};

/**
 * The sector grid, from a single upstream call.
 *
 * `/api/allIndices` returns the level and day change for every index at once,
 * so sixteen cards cost one request — and behind the cache, one request per
 * few minutes however many people are looking.
 *
 * What the grid deliberately no longer shows is each sector's top gainer and
 * loser. Those need a quote for every constituent of every sector; with a
 * database the poller had already collected them, but computing them here
 * would mean hundreds of calls to render one screen. They remain on the sector
 * page, where the cost is one sector's worth.
 */
export async function listSectors(): Promise<SectorSummary[]> {
  const indices = await liveIndices();
  const byName = new Map(
    (indices.ok ? indices.data : []).map((index) => [index.index.toUpperCase(), index]),
  );

  return SECTOR_CATALOGUE.map((sector) => {
    const level = byName.get(sector.name.toUpperCase());
    return {
      key: sector.key,
      name: sector.name,
      displayName: sector.displayName,
      lastLevel: level?.last ?? null,
      lastChangePercent: level?.percentChange ?? null,
      levelAt: indices.ok ? new Date(indices.at) : null,
      memberCount: null,
      topGainer: null,
      topLoser: null,
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
  quoteSource: string | null;
  rsi14: number | null;
  newsCount: number;
  nextEvent: { eventDate: string; type: string } | null;
  inWatchlist: boolean;
};

/**
 * How many constituents may be quoted while rendering one sector page.
 *
 * A quote is one request per share. There is no batch endpoint that answers
 * without a crumb, and NSE's own `equity-stockIndices` — which used to return a
 * whole index with prices in one response — was removed and now 404s.
 *
 * NSE is held to a 2s gap and answers in roughly 2.5s. Ten shares measured 43s
 * cold once the index levels, the market header and NSE's session handshake
 * were counted — inside the 60s ceiling, but not by enough to survive an
 * upstream having a slow day. Eight leaves real headroom.
 *
 * The rest of the table renders without a price rather than making the page
 * wait, and each quote is cached under its own key — so the shares a sector
 * page warms are already warm when you open one of them.
 */
const QUOTE_BUDGET = 8;

export async function getSectorDetail(key: string) {
  const sector = SECTOR_CATALOGUE.find((candidate) => candidate.key === key);
  if (!sector) return null;

  const [indices, constituents] = [await liveIndices(), sector.constituentsFile
    ? await liveConstituents(sector.constituentsFile)
    : null];

  const level = indices.ok
    ? indices.data.find((index) => index.index.toUpperCase() === sector.name.toUpperCase())
    : undefined;

  const members = constituents?.ok ? constituents.data : [];

  // Sequential, never Promise.all: one request in flight per host is the whole
  // politeness story, and it is not negotiable for a convenience like this.
  const rows: ConstituentRow[] = [];
  for (const [position, member] of members.entries()) {
    let quote = null;
    if (position < QUOTE_BUDGET) {
      const result = await liveQuote(member.symbol);
      if (result.ok) quote = result.data;
    }

    const dayChange =
      quote?.lastPrice != null && quote.previousClose != null
        ? quote.lastPrice - quote.previousClose
        : null;

    rows.push({
      id: member.symbol,
      symbol: member.symbol,
      name: member.name,
      lastPrice: quote?.lastPrice ?? null,
      dayChange,
      dayChangePercent:
        dayChange != null && quote?.previousClose ? (dayChange / quote.previousClose) * 100 : null,
      dayLow: quote?.dayLow ?? null,
      dayHigh: quote?.dayHigh ?? null,
      volume: quote?.volume ?? null,
      quotedAt: quote?.quotedAt ? new Date(quote.quotedAt) : null,
      quoteSource: quote ? "NSE" : null,
      rsi14: null,
      newsCount: 0,
      nextEvent: null,
      inWatchlist: false,
    });
  }

  const moved = rows
    .filter((row): row is ConstituentRow & { dayChangePercent: number } => row.dayChangePercent != null)
    .sort((a, b) => b.dayChangePercent - a.dayChangePercent);

  return {
    key: sector.key,
    name: sector.name,
    displayName: sector.displayName,
    lastLevel: level?.last ?? null,
    lastChangePercent: level?.percentChange ?? null,
    levelAt: indices.ok ? new Date(indices.at) : null,
    constituentsSyncedAt: constituents?.ok ? new Date(constituents.at) : null,
    constituentsError: constituents && !constituents.ok ? constituents.error : null,
    topGainer: moved[0] ? { symbol: moved[0].symbol, changePercent: moved[0].dayChangePercent } : null,
    topLoser: moved.at(-1)
      ? { symbol: moved.at(-1)!.symbol, changePercent: moved.at(-1)!.dayChangePercent }
      : null,
    rows,
  };
}
