/**
 * SQLite has no enum type, so every "enum" column in schema.prisma is a String
 * paired with one of the unions below. Keeping the values here — rather than
 * inlining string literals at call sites — means a typo is a type error, and a
 * zod guard exists for anything crossing a boundary.
 *
 * The names deliberately match what a Postgres enum would have been called, so
 * the schema reads the same as the sibling projects.
 */
import { z } from "zod";

const union = <const T extends readonly [string, ...string[]]>(values: T) => ({
  values,
  schema: z.enum(values),
});

export const MembershipSource = union(["INDEX_CSV", "YAHOO_SEARCH", "MANUAL"] as const);
export type MembershipSource = (typeof MembershipSource.values)[number];

export const PriceInterval = union(["DAILY", "INTRADAY"] as const);
export type PriceInterval = (typeof PriceInterval.values)[number];

export const TrendState = union(["ABOVE_200", "BELOW_200", "UNKNOWN"] as const);
export type TrendState = (typeof TrendState.values)[number];

export const CorporateEventType = union([
  "BOARD_MEETING",
  "EARNINGS",
  "DIVIDEND",
  "BONUS",
  "SPLIT",
  "RIGHTS",
  "BUYBACK",
  "AGM",
  "OTHER",
] as const);
export type CorporateEventType = (typeof CorporateEventType.values)[number];

export const CorporateEventSource = union([
  "NSE_EVENT_CALENDAR",
  "NSE_CORPORATE_ACTIONS",
] as const);
export type CorporateEventSource = (typeof CorporateEventSource.values)[number];

export const NewsCategory = union([
  "RESULTS",
  "ORDER_WIN",
  "MERGER_DEAL",
  "RATING",
  "REGULATORY",
  "MANAGEMENT",
  "DIVIDEND_ACTION",
  "FUNDRAISE",
  "LEGAL",
  "PRODUCT",
  "MACRO_SECTOR",
  "OTHER",
] as const);
export type NewsCategory = (typeof NewsCategory.values)[number];

export const NewsPolarity = union(["POSITIVE", "NEGATIVE", "NEUTRAL"] as const);
export type NewsPolarity = (typeof NewsPolarity.values)[number];

export const UnderlyingKind = union(["INDEX", "EQUITY"] as const);
export type UnderlyingKind = (typeof UnderlyingKind.values)[number];

/**
 * How open interest moved against price on one side of a strike. This is the
 * standard reading and it is descriptive, not predictive:
 *   price up   + OI up   → new longs opening       (LONG_BUILDUP)
 *   price down + OI up   → new shorts opening      (SHORT_BUILDUP)
 *   price up   + OI down → shorts closing out      (SHORT_COVERING)
 *   price down + OI down → longs closing out       (LONG_UNWINDING)
 */
export const OiBuildup = union([
  "LONG_BUILDUP",
  "SHORT_BUILDUP",
  "SHORT_COVERING",
  "LONG_UNWINDING",
  "FLAT",
] as const);
export type OiBuildup = (typeof OiBuildup.values)[number];

export const SourceKey = union([
  "NSE_MARKET_STATUS",
  "NSE_ALL_INDICES",
  "NSE_EQUITY_MASTER",
  "NSE_EVENT_CALENDAR",
  "NSE_CORPORATE_ACTIONS",
  "NSE_OPTION_CHAIN",
  "NIFTY_CONSTITUENTS",
  "YAHOO_QUOTES",
  /** Post-close bars + indicators. Separate from YAHOO_QUOTES on purpose: they
   *  share an upstream but not a schedule, and one bookkeeping row cannot carry
   *  two cadences — a quotes run just before 16:15 would silently suppress the
   *  daily bars job for that day. */
  "YAHOO_DAILY_BARS",
  "YAHOO_SEARCH",
  "GOOGLE_NEWS",
] as const);
export type SourceKey = (typeof SourceKey.values)[number];

export const FetchStatus = union(["OK", "FAILED", "SKIPPED"] as const);
export type FetchStatus = (typeof FetchStatus.values)[number];
