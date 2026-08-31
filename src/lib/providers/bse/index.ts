import { politeFetch } from "../http";

import { parseBseHighLow, parseBseQuote, type BseHighLow, type BseQuote } from "./parse-quote";
import { parseBseIntraday, type IntradaySeries } from "./parse-intraday";
import { parseScripMaster, type ScripEntry } from "./parse-scrip-master";

/**
 * BSE, used only as a fallback for prices.
 *
 * The panel is an NSE panel and NSE is the reference throughout — sectors,
 * events and the option chain all come from there. But quotes had a single
 * point of failure: when Yahoo rate-limits an IP it does so for hours, and the
 * whole panel loses its prices. BSE lists the same companies on an entirely
 * separate host, so it keeps numbers on the screen.
 *
 * The two exchanges do not print identical prices. Anything sourced here is
 * recorded as such and labelled on screen; a BSE price displayed as an NSE one
 * would be a small, quiet lie.
 */
const REFERER = "https://www.bseindia.com/";

export async function fetchScripMaster(): Promise<ScripEntry[]> {
  const response = await politeFetch(
    "https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w" +
      "?Group=&Scripcode=&industry=&segment=Equity&status=Active",
    { source: "BSE_QUOTES", referer: REFERER, accept: "application/json" },
  );
  return parseScripMaster(response.text);
}

export async function fetchBseQuote(scripCode: string): Promise<BseQuote> {
  const response = await politeFetch(
    `https://api.bseindia.com/BseIndiaAPI/api/getScripHeaderData/w?Debtflag=&scripcode=${encodeURIComponent(scripCode)}&seriesid=`,
    { source: "BSE_QUOTES", referer: REFERER, accept: "application/json" },
  );
  return parseBseQuote(response.text, scripCode);
}

/**
 * The 52-week range. A second request, so it is fetched only for shares that do
 * not have one yet rather than on every poll — the range moves slowly enough
 * that re-asking hourly would be waste dressed up as freshness.
 */
export async function fetchBseHighLow(scripCode: string): Promise<BseHighLow> {
  const response = await politeFetch(
    `https://api.bseindia.com/BseIndiaAPI/api/HighLow/w?Type=EQ&flag=C&scripcode=${encodeURIComponent(scripCode)}`,
    { source: "BSE_QUOTES", referer: REFERER, accept: "application/json" },
  );
  return parseBseHighLow(response.text);
}

/**
 * Today's price path, a minute at a time.
 *
 * `flag=0` is the current session. This is the only intraday source that
 * answers: NSE's `quote-equity` returns 403 to any non-browser client, and its
 * `chart-databyindex` returns an empty series even during market hours with a
 * valid cookie.
 */
export async function fetchBseIntraday(scripCode: string): Promise<IntradaySeries> {
  const response = await politeFetch(
    "https://api.bseindia.com/BseIndiaAPI/api/StockReachGraph/w" +
      `?scripcode=${encodeURIComponent(scripCode)}&flag=0&fromdate=&todate=&seriesid=`,
    { source: "BSE_QUOTES", referer: REFERER, accept: "application/json" },
  );
  return parseBseIntraday(response.text, scripCode);
}

export type { BseHighLow, BseQuote, IntradaySeries, ScripEntry };
