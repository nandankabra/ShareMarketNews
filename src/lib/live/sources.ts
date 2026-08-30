import "server-only";

import { parseNseDate } from "@/lib/date/ist";
import { fetchScripMaster } from "@/lib/providers/bse";
import { fetchNews } from "@/lib/providers/googlenews";
import { fetchConstituents } from "@/lib/providers/niftyindices";
import {
  fetchAllIndices,
  fetchEventCalendar,
  fetchHistorical,
  fetchMarketStatus,
  fetchOptionChain,
  fetchOptionExpiries,
} from "@/lib/providers/nse";
import { fetchChart, type ChartRange } from "@/lib/providers/yahoo";
import { toYahooSymbol } from "@/lib/providers/yahoo/symbol";

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

export const liveConstituents = liveSource(
  "constituents",
  async (file: string) => fetchConstituents(file),
  TTL.constituents,
);

export const liveEvents = liveSource("event-calendar", async () => fetchEventCalendar(), TTL.events);

/**
 * One share's quote and its price history, from a single upstream response.
 *
 * The chart endpoint returns both, so asking for bars costs nothing beyond the
 * quote — which is what makes on-the-fly technical analysis affordable without
 * a table of stored snapshots behind it.
 */
export const liveQuote = liveSource(
  "quote",
  async (symbol: string, range: ChartRange = "6mo"): Promise<LiveQuote> => {
    const quote = await fetchChart(toYahooSymbol(symbol), range, "1d");
    return {
      symbol,
      name: quote.name,
      currency: quote.currency,
      lastPrice: quote.lastPrice,
      previousClose: quote.previousClose,
      dayHigh: quote.dayHigh,
      dayLow: quote.dayLow,
      week52High: quote.week52High,
      week52Low: quote.week52Low,
      volume: quote.volume,
      quotedAt: quote.quotedAt ? quote.quotedAt.getTime() : null,
      bars: quote.bars.map((bar) => ({
        at: bar.at.getTime(),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      })),
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

/** Re-exported so callers need only this module. */
export type { Live };
