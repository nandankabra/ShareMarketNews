import { nseApiFetch } from "./session";
import { parseAllIndices, type IndexLevel } from "./parse-all-indices";
import { parseCorporateActions, type CorporateAction } from "./parse-corporate-actions";
import { parseEventCalendar, type UpcomingEvent } from "./parse-event-calendar";
import { parseMarketStatus, type MarketStatus } from "./parse-market-status";
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

export async function fetchCorporateActions(): Promise<CorporateAction[]> {
  const body = await nseApiFetch("api/corporates-corporateActions?index=equities", {
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
