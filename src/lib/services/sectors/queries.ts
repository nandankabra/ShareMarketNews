import "server-only";

import { liveConstituents, liveDirectory, liveIndices, liveQuote } from "@/lib/live/sources";
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
 * Quotes come from BSE now, which is held to a 1.5s gap and answers in about
 * 0.3s — cheaper than the NSE daily-bar call this replaced, and live rather
 * than yesterday's close. Eight is roughly fifteen seconds cold, well inside
 * the page's 60s budget.
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

  // Quotes are keyed by BSE scrip code, so the directory has to answer "what is
  // TCS on BSE" first. Matched on ISIN rather than on the ticker: both
  // exchanges carry the same ISIN by definition, whereas the two ticker spaces
  // agree only most of the time.
  const directory = await liveDirectory();
  const byIsin = new Map<string, string>();
  const byTicker = new Map<string, string>();
  if (directory.ok) {
    for (const entry of directory.data) {
      if (entry.isin) byIsin.set(entry.isin.toUpperCase(), entry.scripCode);
      if (entry.scripId) byTicker.set(entry.scripId.toUpperCase(), entry.scripCode);
    }
  }

  // Sequential, never Promise.all: one request in flight per host is the whole
  // politeness story, and it is not negotiable for a convenience like this.
  const rows: ConstituentRow[] = [];
  for (const [position, member] of members.entries()) {
    let quote = null;
    const scripCode =
      (member.isin ? byIsin.get(member.isin.toUpperCase()) : undefined) ??
      byTicker.get(member.symbol.toUpperCase());

    if (position < QUOTE_BUDGET && scripCode) {
      const result = await liveQuote(scripCode);
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
      quoteSource: quote ? "BSE" : null,
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
