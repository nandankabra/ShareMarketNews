/**
 * NSE symbol to Yahoo symbol.
 *
 * Almost every NSE symbol maps to `${symbol}.NS`, but the mapping is stored on
 * the Share row rather than recomputed at call sites — see the schema comment.
 * This function exists for the one moment the mapping is first established.
 */
const OVERRIDES: Record<string, string> = {
  // Yahoo lists a handful under a different stem than NSE uses.
  NIFTY: "^NSEI",
  BANKNIFTY: "^NSEBANK",
};

export function toYahooSymbol(nseSymbol: string): string {
  const symbol = nseSymbol.trim().toUpperCase();
  return OVERRIDES[symbol] ?? `${symbol}.NS`;
}

/**
 * Encode for a URL path segment exactly once. Symbols like M&M carry an
 * ampersand that must not survive into the query string raw, and must not be
 * double-encoded either — %26 becoming %2526 silently yields NOT_FOUND.
 */
export function encodeYahooSymbol(yahooSymbol: string): string {
  return encodeURIComponent(yahooSymbol);
}
