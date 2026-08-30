import "server-only";

import { liveDirectory } from "./sources";

/**
 * Look a share up by its NSE symbol.
 *
 * The Share table used to answer this. The BSE scrip master answers it now:
 * its `scrip_id` matches the NSE ticker closely enough to join on, and it
 * carries the one field nothing else has — the full registered company name.
 *
 * That name matters more than it looks. Google News is searched by company
 * name, and `"TCS"` returns a different company entirely; `"Tata Consultancy
 * Services"` returns the right one.
 */
export type ShareIdentity = {
  symbol: string;
  name: string;
  isin: string | null;
  /** BSE scrip code, for a live intraday price. */
  scripCode: string | null;
};

export async function resolveShare(symbol: string): Promise<ShareIdentity> {
  const upper = symbol.toUpperCase();
  const directory = await liveDirectory();

  const match = directory.ok
    ? directory.data.find((entry) => entry.scripId?.toUpperCase() === upper)
    : undefined;

  return {
    symbol: upper,
    // Falling back to the ticker is deliberate: a share that BSE does not list
    // still has a chart and a page, it just gets a weaker news search.
    name: match?.name ?? upper,
    isin: match?.isin ?? null,
    scripCode: match?.scripCode ?? null,
  };
}
