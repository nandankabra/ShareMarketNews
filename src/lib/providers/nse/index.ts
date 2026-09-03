import { nseApiFetch } from "./session";
import { parseAllIndices, type IndexLevel } from "./parse-all-indices";
import { parseCorporateActions, type CorporateAction } from "./parse-corporate-actions";
import { parseEventCalendar, type UpcomingEvent } from "./parse-event-calendar";
import { parseMarketStatus, type MarketStatus } from "./parse-market-status";
import { parseHistorical, type HistoricalBar } from "./parse-historical";
import { parseExpiryDates, parseOptionChain, type OptionChain } from "./parse-option-chain";

/**
 * Each function does three things and no more: build a path, fetch it with a
 * matching Referer, hand the text to a pure parser. That split is what lets
 * every parser be tested against a saved payload with no mocking at all.
 */

const LIVE_MARKET = "https://www.nseindia.com/market-data/live-equity-market";
const EVENT_PAGE = "https://www.nseindia.com/companies-listing/corporate-filings-event-calendar";
const ACTIONS_PAGE = "https://www.nseindia.com/companies-listing/corporate-filings-actions";
const OPTION_PAGE = "https://www.nseindia.com/option-chain";

export async function fetchMarketStatus(): Promise<MarketStatus> {
  const body = await nseApiFetch("api/marketStatus", {
    source: "NSE_MARKET_STATUS",
    referer: LIVE_MARKET,
  });
  return parseMarketStatus(body);
}

export async function fetchAllIndices(): Promise<IndexLevel[]> {
  const body = await nseApiFetch("api/allIndices", {
    source: "NSE_ALL_INDICES",
    referer: LIVE_MARKET,
  });
  return parseAllIndices(body);
}

export async function fetchEventCalendar(): Promise<UpcomingEvent[]> {
  const body = await nseApiFetch("api/event-calendar", {
    source: "NSE_EVENT_CALENDAR",
    referer: EVENT_PAGE,
  });
  return parseEventCalendar(body);
}

/** NSE's date parameters want DD-MM-YYYY; our day keys are YYYY-MM-DD. */
function toNseParamDate(dayKey: string): string {
  const [year, month, day] = dayKey.split("-");
  return `${day}-${month}-${year}`;
}

/**
 * Corporate actions — dividends, buybacks, splits — with their ex-dates.
 *
 * Without a window NSE answers with a very short one: on the day this was
 * written that was twenty rows, all dividends going ex within about a week,
 * and not a single buyback. Buybacks are rare enough that a week of them is
 * usually none, so a caller that wants to know whether one is coming has to
 * ask for a month. The same month of rows carries the dividends too, which is
 * why this is one call rather than one per subject.
 */
export async function fetchCorporateActions(
  window?: { from: string; to: string },
): Promise<CorporateAction[]> {
  const range = window
    ? `&from_date=${toNseParamDate(window.from)}&to_date=${toNseParamDate(window.to)}`
    : "";
  const body = await nseApiFetch(`api/corporates-corporateActions?index=equities${range}`, {
    source: "NSE_CORPORATE_ACTIONS",
    referer: ACTIONS_PAGE,
  });
  return parseCorporateActions(body);
}

/** The expiries currently listed for an underlying, newest first. */
export async function fetchOptionExpiries(symbol: string): Promise<string[]> {
  const body = await nseApiFetch(
    `api/option-chain-contract-info?symbol=${encodeURIComponent(symbol)}`,
    { source: "NSE_OPTION_CHAIN", referer: OPTION_PAGE },
  );
  return parseExpiryDates(body);
}

/**
 * The v3 chain endpoint. The older `option-chain-indices` path was removed and
 * now 404s; v3 requires an explicit expiry and returns `{}` without one.
 */
export async function fetchOptionChain(
  symbol: string,
  expiryLabel: string,
  expiryDayKey: string,
  kind: "Indices" | "Equity" = "Indices",
): Promise<OptionChain> {
  const body = await nseApiFetch(
    `api/option-chain-v3?type=${kind}&symbol=${encodeURIComponent(symbol)}&expiry=${encodeURIComponent(expiryLabel)}`,
    { source: "NSE_OPTION_CHAIN", referer: OPTION_PAGE },
  );
  return parseOptionChain(body, expiryDayKey);
}

export { nseApiFetch };

/** NSE wants DD-MM-YYYY on this endpoint, unlike every other date it returns. */
function toNseRange(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getUTCFullYear()}`;
}

/**
 * Daily bars for one share.
 *
 * `historical/cm/equity` is the path most clients use and it answered 503 on
 * every attempt; this older `historicalOR` path is the one that actually
 * returns data, which is worth writing down because the two look
 * interchangeable and only one works.
 *
 * `days` is calendar days, not bars: roughly 64 trading days come back per
 * three months, so the default reaches about 250 bars — the window the
 * support/resistance clustering is defined over.
 */
export async function fetchHistorical(symbol: string, days = 420): Promise<HistoricalBar[]> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);

  const body = await nseApiFetch(
    `api/historicalOR/generateSecurityWiseHistoricalData` +
      `?from=${toNseRange(from)}&to=${toNseRange(to)}` +
      `&symbol=${encodeURIComponent(symbol)}&type=priceVolumeDeliverable&series=EQ`,
    {
      source: "NSE_HISTORICAL",
      referer: `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`,
    },
  );

  return parseHistorical(body, symbol);
}

export type { HistoricalBar };
