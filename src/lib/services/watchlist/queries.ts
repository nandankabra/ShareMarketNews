import "server-only";

import { istToday } from "@/lib/date/ist";
import { analyse } from "@/lib/live/analysis";
import { resolveShare } from "@/lib/live/directory";
import { liveDirectory, liveEvents, liveHistory } from "@/lib/live/sources";
import type { Candle } from "@/lib/ta/types";
import { readWatchlist } from "@/lib/watchlist/store";

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

/**
 * The watchlist: a cookie of symbols, joined to live data.
 *
 * One history call per entry, which is affordable precisely because this list
 * is yours and short — it is the one screen where fetching per row is the right
 * shape. The bars carry the price, the sparkline and the RSI together, so a row
 * costs one request rather than three.
 */
export async function listWatchlist(): Promise<WatchlistRow[]> {
  const entries = await readWatchlist();
  if (entries.length === 0) return [];

  const events = await liveEvents();
  const today = istToday();

  const rows: WatchlistRow[] = [];
  // Sequential: one request in flight per host, as everywhere else.
  for (const entry of entries) {
    const identity = await resolveShare(entry.symbol);
    const history = await liveHistory(entry.symbol);

    const candles: Candle[] = history.ok
      ? history.data.map((bar) => ({
          t: new Date(`${bar.day}T00:00:00.000Z`).getTime(),
          o: bar.open, h: bar.high, l: bar.low, c: bar.close, v: bar.volume,
        }))
      : [];

    const ta = analyse(candles);
    const lastBar = history.ok ? history.data.at(-1) : undefined;

    const nextEvent = (events.ok ? events.data : [])
      .filter((event) => event.symbol.toUpperCase() === entry.symbol && event.eventDate >= today)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0];

    rows.push({
      shareId: entry.symbol,
      symbol: entry.symbol,
      name: identity.name,
      note: entry.note,
      addedAt: new Date(entry.addedAt),
      addedPrice: entry.addedPrice,
      lastPrice: ta.close,
      dayChangePercent: ta.dayChangePercent,
      quotedAt: lastBar ? new Date(`${lastBar.day}T00:00:00.000Z`) : null,
      rsi14: ta.rsi14,
      sinceAddedPercent:
        entry.addedPrice && ta.close != null
          ? ((ta.close - entry.addedPrice) / entry.addedPrice) * 100
          : null,
      spark: candles.slice(-30).map((candle) => candle.c),
      // A per-share news count would be one Google query per row. The share
      // page carries the headlines; this column would cost more than it says.
      newsCount: 0,
      nextEvent: nextEvent ? { eventDate: nextEvent.eventDate, type: nextEvent.type } : null,
    });
  }

  return rows;
}

export type SearchHitRow = {
  symbol: string;
  name: string;
  sector: string | null;
  tracked: boolean;
  inWatchlist: boolean;
};

/**
 * Search by symbol or company name.
 *
 * Backed by the BSE directory — one cached call covering roughly five thousand
 * listed companies, which is a far larger universe than the sector index files
 * ever held. Symbol prefix matches rank first, because typing "TCS" means the
 * ticker, not the first company whose name happens to contain those letters.
 */
export async function searchLocalShares(query: string, limit = 8): Promise<SearchHitRow[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const [directory, watched] = [await liveDirectory(), await readWatchlist()];
  if (!directory.ok) return [];

  const upper = term.toUpperCase();
  const lower = term.toLowerCase();
  const inList = new Set(watched.map((entry) => entry.symbol));

  const matches = directory.data.filter((entry) => {
    const id = entry.scripId?.toUpperCase() ?? "";
    return id.includes(upper) || (entry.name?.toLowerCase().includes(lower) ?? false);
  });

  return matches
    .sort((a, b) => {
      const aId = a.scripId?.toUpperCase() ?? "";
      const bId = b.scripId?.toUpperCase() ?? "";
      const aExact = aId === upper ? 0 : aId.startsWith(upper) ? 1 : 2;
      const bExact = bId === upper ? 0 : bId.startsWith(upper) ? 1 : 2;
      if (aExact !== bExact) return aExact - bExact;
      return aId.localeCompare(bId);
    })
    .slice(0, limit)
    .map((entry) => ({
      symbol: entry.scripId?.toUpperCase() ?? "",
      name: entry.name ?? entry.scripId ?? "",
      sector: null,
      tracked: true,
      inWatchlist: inList.has(entry.scripId?.toUpperCase() ?? ""),
    }))
    .filter((hit) => hit.symbol.length > 0);
}
