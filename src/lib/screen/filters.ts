/**
 * A technical screen.
 *
 * Every criterion here is a measurement taken from price and volume — where a
 * share sits against its own history. Nothing in this module scores, ranks by
 * desirability, or answers "should I buy this". It filters a list, and the list
 * is ordered by symbol so the order carries no opinion either.
 *
 * Fundamentals are deliberately absent: NSE publishes quarterly numbers only as
 * XBRL attachments, one document per company per quarter, so a P/E or a ROCE
 * filter is not something this app can honestly offer. See the note in
 * docs/ARCHITECTURE.md.
 */
export type ScreenRow = {
  symbol: string;
  name: string | null;
  close: number | null;
  dayChangePercent: number | null;
  rsi14: number | null;
  atrPercent: number | null;
  /** Percent below the 52-week high. 0 means sitting on it. */
  fromHighPercent: number | null;
  /** Percent above the 52-week low. */
  fromLowPercent: number | null;
  sma50: number | null;
  sma200: number | null;
  crossDirection: "GOLDEN" | "DEATH" | null;
  crossAgeDays: number | null;
};

export type ScreenCriteria = {
  rsiMin: number | null;
  rsiMax: number | null;
  /** Keep shares within this many percent of their 52-week high. */
  nearHighPct: number | null;
  /** Keep shares within this many percent of their 52-week low. */
  nearLowPct: number | null;
  /** Where the close must sit relative to a moving average. */
  vsSma50: "ABOVE" | "BELOW" | null;
  vsSma200: "ABOVE" | "BELOW" | null;
  cross: "GOLDEN" | "DEATH" | null;
  /** Percent daily range, as a volatility band. */
  atrMin: number | null;
  atrMax: number | null;
};

export const EMPTY_CRITERIA: ScreenCriteria = {
  rsiMin: null,
  rsiMax: null,
  nearHighPct: null,
  nearLowPct: null,
  vsSma50: null,
  vsSma200: null,
  cross: null,
  atrMin: null,
  atrMax: null,
};

/**
 * A share that cannot answer a criterion fails it.
 *
 * The alternative — treating an unknown as a pass — quietly fills the results
 * with shares that have too little history to have an RSI at all, which reads
 * as a screen finding something when it has found a gap in the data.
 */
function atLeast(value: number | null, min: number | null): boolean {
  if (min == null) return true;
  return value != null && value >= min;
}

function atMost(value: number | null, max: number | null): boolean {
  if (max == null) return true;
  return value != null && value <= max;
}

function side(close: number | null, average: number | null, want: "ABOVE" | "BELOW" | null): boolean {
  if (want == null) return true;
  if (close == null || average == null) return false;
  return want === "ABOVE" ? close > average : close < average;
}

export function matches(row: ScreenRow, criteria: ScreenCriteria): boolean {
  return (
    atLeast(row.rsi14, criteria.rsiMin) &&
    atMost(row.rsi14, criteria.rsiMax) &&
    atMost(row.fromHighPercent, criteria.nearHighPct) &&
    atMost(row.fromLowPercent, criteria.nearLowPct) &&
    side(row.close, row.sma50, criteria.vsSma50) &&
    side(row.close, row.sma200, criteria.vsSma200) &&
    (criteria.cross == null || row.crossDirection === criteria.cross) &&
    atLeast(row.atrPercent, criteria.atrMin) &&
    atMost(row.atrPercent, criteria.atrMax)
  );
}

/** True when the screen would keep everything — used to label the empty state. */
export function isEmptyCriteria(criteria: ScreenCriteria): boolean {
  return Object.values(criteria).every((value) => value == null);
}

const number = (raw: string | undefined, min: number, max: number): number | null => {
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return value;
};

const oneOf = <T extends string>(raw: string | undefined, allowed: readonly T[]): T | null =>
  allowed.includes(raw as T) ? (raw as T) : null;

/**
 * Read criteria off the query string.
 *
 * Anything unparseable becomes null rather than an error: a hand-edited URL
 * should narrow the screen less, never break the page. Bounds are applied here
 * so a nonsense range cannot reach the filter.
 */
export function parseCriteria(params: Record<string, string | undefined>): ScreenCriteria {
  return {
    rsiMin: number(params.rsiMin, 0, 100),
    rsiMax: number(params.rsiMax, 0, 100),
    nearHighPct: number(params.nearHigh, 0, 100),
    nearLowPct: number(params.nearLow, 0, 100),
    vsSma50: oneOf(params.sma50, ["ABOVE", "BELOW"] as const),
    vsSma200: oneOf(params.sma200, ["ABOVE", "BELOW"] as const),
    cross: oneOf(params.cross, ["GOLDEN", "DEATH"] as const),
    atrMin: number(params.atrMin, 0, 100),
    atrMax: number(params.atrMax, 0, 100),
  };
}
