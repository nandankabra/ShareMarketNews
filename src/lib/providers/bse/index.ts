import { politeFetch } from "../http";

import { parseBseQuote, type BseQuote } from "./parse-quote";
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

export type { BseQuote, ScripEntry };
