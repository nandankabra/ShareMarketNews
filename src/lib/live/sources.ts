import "server-only";

import { parseNseDate } from "@/lib/date/ist";
import { fetchBseIntraday, fetchBseQuote, fetchScripMaster } from "@/lib/providers/bse";
import { fetchNews } from "@/lib/providers/googlenews";
import { fetchConstituents } from "@/lib/providers/niftyindices";
import {
  fetchAllIndices,
  fetchCorporateActions,
  fetchEventCalendar,
  fetchHistorical,
  fetchIndexHistory,
  fetchMarketStatus,
  fetchOptionChain,
  fetchOptionExpiries,
} from "@/lib/providers/nse";

import { liveSource, TTL, type Live } from "./cache";

/**
 * Every upstream the read path uses, cached and shared.
 *
 * One rule throughout: nothing here returns a `Date`. `unstable_cache` persists
 * its entries as JSON, so a Date goes in and an ISO *string* comes back — typed
 * as Date, and blowing up on the first `.getTime()` well away from the cause.
 * Epoch milliseconds cross that boundary honestly.
 */

export type LiveBar = {
  at: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type LiveQuote = {
  symbol: string;
  name: string | null;
  currency: string;
  lastPrice: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  week52High: number | null;
  week52Low: number | null;
  volume: number | null;
  quotedAt: number | null;
  bars: LiveBar[];
};

export type LiveNewsItem = {
  dedupKey: string;
  title: string;
  url: string;
  source: string | null;
  publishedAt: number;
};

export const liveMarketStatus = liveSource(
  "market-status",
  async () => fetchMarketStatus(),
  TTL.marketStatus,
);

export const liveIndices = liveSource("all-indices", async () => fetchAllIndices(), TTL.indices);

/**
 * Daily bars for an index.
 *
 * Same window as a share's candles: these change once a day, and the level in
 * the header is where the live number comes from.
 */
export const liveIndexHistory = liveSource(
  "index-history",
  async (indexName: string) => fetchIndexHistory(indexName),
  TTL.candles,
);

export const liveConstituents = liveSource(
  "constituents",
  async (file: string) => fetchConstituents(file),
  TTL.constituents,
);

export const liveEvents = liveSource("event-calendar", async () => fetchEventCalendar(), TTL.events);

/**
 * Dividends, buybacks and splits going ex inside a window.
 *
 * The window is an argument rather than a constant so it lands in the cache key
 * — a month asked for today and the same month asked for tomorrow are different
 * questions, and sharing one entry between them would serve yesterday's answer
 * after midnight.
 */
export const liveCorporateActions = liveSource(
  "corporate-actions",
  async (from: string, to: string) => fetchCorporateActions({ from, to }),
  TTL.events,
);

/**
 * One share's quote and its price history, from a single upstream response.
 *
 * The chart endpoint returns both, so asking for bars costs nothing beyond the
 * quote — which is what makes on-the-fly technical analysis affordable without
 * a table of stored snapshots behind it.
 */
/**
 * A live quote for one share.
 *
 * Keyed by BSE scrip code rather than symbol, because that is what the endpoint
 * takes and what makes the cache entry unambiguous.
 *
 * This replaced a quote derived from NSE's daily bars, which had one fatal
 * property for a screen you actually watch: the newest daily bar is yesterday's
 * close until the session ends, so every price in every table was a day old
 * during exactly the hours you would be looking. This is the last traded price.
 *
 * It is also cheaper — a small JSON object against twenty days of OHLC — at the
 * cost of the volume field, which this endpoint does not carry.
 */
export const liveQuote = liveSource(
  "quote",
  async (scripCode: string): Promise<LiveQuote> => {
    const quote = await fetchBseQuote(scripCode);
    return {
      symbol: scripCode,
      name: quote.name,
      currency: "INR",
      lastPrice: quote.lastPrice,
      previousClose: quote.previousClose,
      dayHigh: quote.dayHigh,
      dayLow: quote.dayLow,
      // Neither the 52-week range nor volume is on this endpoint. Null rather
      // than inferred: a made-up range would quietly corrupt the position bar.
      week52High: null,
      week52Low: null,
      volume: null,
      quotedAt: Date.now(),
      bars: [],
    };
  },
  TTL.quote,
);

export const liveNews = liveSource(
  "news",
  async (companyName: string): Promise<LiveNewsItem[]> => {
    const items = await fetchNews(companyName, "7d");
    return items.map((item) => ({
      dedupKey: item.dedupKey,
      title: item.title,
      url: item.url,
      source: item.source,
      publishedAt: item.publishedAt.getTime(),
    }));
  },
  TTL.news,
);

export const liveOptionExpiries = liveSource(
  "option-expiries",
  async (symbol: string) => fetchOptionExpiries(symbol),
  TTL.optionChain,
);

/**
 * `expiryLabel` is NSE's own "30-Sep-2026" string and must be passed back
 * verbatim — the v3 endpoint matches on it exactly. The day key is our
 * normalised form, derived here so callers never hold both.
 */
export const liveOptionChain = liveSource(
  "option-chain",
  async (symbol: string, expiryLabel: string) => {
    const dayKey = parseNseDate(expiryLabel);
    if (!dayKey) {
      throw new Error(`unrecognised expiry label from NSE: ${expiryLabel}`);
    }
    return fetchOptionChain(symbol, expiryLabel, dayKey);
  },
  TTL.optionChain,
);


/**
 * Daily OHLC — the input to every indicator, level and candle on the site.
 *
 * 420 calendar days is about 250 trading days, the window the support and
 * resistance clustering is defined over.
 */
export const liveHistory = liveSource(
  "history",
  async (symbol: string) => fetchHistorical(symbol, 420),
  TTL.candles,
);

/**
 * The share directory: symbol to company name, ISIN and BSE quote code.
 *
 * This is what replaced the Share table. Without a database there is nothing
 * that knows "TCS" is "Tata Consultancy Services Ltd" — and the news search
 * needs the full name, because searching Google for "TCS" returns the wrong
 * company on a good day. BSE publishes all of it in one call, and `scrip_id`
 * happens to match the NSE symbol, which is what makes the join possible at
 * all.
 *
 * One call for ~5000 companies, cached for a day. Fetching it per share would
 * be absurd; fetching it once is cheaper than the sector CSVs it replaces.
 */
export const liveDirectory = liveSource(
  "bse-directory",
  async () => fetchScripMaster(),
  TTL.constituents,
);

/**
 * Today's session, a minute at a time — the live half of the app.
 *
 * Sixty seconds because that is exactly how often the upstream advances; a
 * shorter window would re-fetch the same series and a longer one would make a
 * "live" chart visibly lag its own clock.
 *
 * Cached like everything else, so a hundred people watching the same share cost
 * one request a minute between them rather than one each.
 */
export const liveIntraday = liveSource(
  "intraday",
  async (scripCode: string) => fetchBseIntraday(scripCode),
  TTL.intraday,
);

/** Re-exported so callers need only this module. */
export type { Live };
