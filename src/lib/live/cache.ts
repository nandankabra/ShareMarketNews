import { unstable_cache } from "next/cache";

import { ProviderError } from "@/lib/providers/errors";

/**
 * The read path, with no database behind it.
 *
 * Every screen used to read SQLite, which the poller filled on its own
 * schedule. Without a database the same screens have to call upstream — and the
 * naive version of that is abusive: twenty visitors refreshing the sector page
 * would be twenty NSE calls a second.
 *
 * `unstable_cache` is what makes it acceptable. It caches the *parsed result*
 * across requests and across deployments, so an upstream is called once per
 * revalidation window no matter how many people are looking. That is a stricter
 * guarantee than the per-host queue gave us, not a weaker one: the queue spaced
 * requests out, this removes most of them entirely.
 *
 * `use cache` is the Next 16 replacement for this API, but it requires the
 * `cacheComponents` flag, which changes rendering semantics for every route in
 * the app. Not a change to make in the same step as dropping the database.
 */

/**
 * Success or failure, never a throw.
 *
 * Pages must render when an upstream is down — that was true when the database
 * was the buffer and it is more important now that there is no buffer at all. A
 * rejected promise inside `unstable_cache` is also not cached, so a failing
 * upstream would be re-hit on every single request: exactly the stampede this
 * layer exists to prevent. Caching the failure is the polite behaviour — but
 * for a shorter window than a success, see `FAILURE_TTL_SECONDS`.
 */
export type Live<T> =
  | { ok: true; data: T; at: number }
  | { ok: false; error: string; kind: string; at: number };

export function liveOk<T>(data: T): Live<T> {
  return { ok: true, data, at: Date.now() };
}

/** Unwrap with a fallback, for callers that have a sensible empty state. */
export function orElse<T>(result: Live<T>, fallback: T): T {
  return result.ok ? result.data : fallback;
}

/**
 * Wrap an upstream call so it is cached, shared and non-throwing.
 *
 * `keyParts` must include every value the function closes over that is not an
 * argument — `unstable_cache` keys on the arguments and the function source,
 * so a captured variable that is not named here silently returns another
 * caller's data.
 */
/**
 * How long a cached *failure* stands before one request is allowed to retry.
 *
 * Failures used to inherit the success TTL. For the option chain that is 300s,
 * so a single bad call — a cold start, one expired NSE cookie — blanked the F&O
 * page for five minutes, while `/health` sat there reporting NSE_OPTION_CHAIN as
 * OK because it asks the upstream directly. The page blamed NSE for something
 * NSE had not done, which is the exact misdiagnosis this whole layer is meant
 * to make impossible.
 *
 * Thirty seconds rather than zero because the stampede argument above is still
 * right: without a window, a failing upstream is re-hit by every visitor.
 */
const FAILURE_TTL_SECONDS = 30;

export function liveSource<A extends readonly unknown[], T>(
  key: string,
  fn: (...args: A) => Promise<T>,
  revalidateSeconds: number,
): (...args: A) => Promise<Live<T>> {
  const wrapped = async (...args: A): Promise<Live<T>> => {
    try {
      return liveOk(await fn(...args));
    } catch (error) {
      const kind = error instanceof ProviderError ? error.kind : "NETWORK";
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message, kind, at: Date.now() };
    }
  };

  const cached = unstable_cache(wrapped, [key], {
    revalidate: revalidateSeconds,
    tags: [key],
  }) as (...args: A) => Promise<Live<T>>;

  /**
   * The same call over a second, short-lived entry.
   *
   * `unstable_cache` fixes its revalidate window when the entry is built, so a
   * single entry cannot hold a success for five minutes and a failure for
   * thirty seconds. Two entries can: this one is consulted only when the long
   * one is holding a failure, and because it is itself cached, at most one
   * request per `FAILURE_TTL_SECONDS` reaches the upstream. The guarantee in
   * docs/HOSTING.md — one call per window however many people are looking —
   * holds; a failure just gets a shorter window than a success.
   *
   * Never longer than the success window: for a source like `quote` (20s) the
   * long entry already retries faster than this would.
   */
  const failureTtl = Math.min(FAILURE_TTL_SECONDS, revalidateSeconds);

  const retried = unstable_cache(wrapped, [key, "retry"], {
    revalidate: failureTtl,
    tags: [key],
  }) as (...args: A) => Promise<Live<T>>;

  return async (...args: A): Promise<Live<T>> => {
    const first = await cached(...args);
    if (first.ok) return first;

    // A failure this request just produced is not worth immediately repeating —
    // consulting the retry entry here would populate it from the same outage
    // and cost two upstream calls for one page view. Only a failure that has
    // been standing longer than the failure window earns another attempt.
    if (Date.now() - first.at < failureTtl * 1000) return first;

    return retried(...args);
  };
}

/**
 * How long each upstream's answer stays good.
 *
 * These are deliberately longer than the poller's old intervals. The poller ran
 * on one machine and could afford to be eager; this runs per visitor, and the
 * cost of being wrong is charged to the upstream rather than to us. A quote
 * that is two minutes stale is not a problem this app has — it describes
 * movement, it does not execute on it.
 */
export const TTL = {
  /** Cheap, and it gates the "is the market open" banner. */
  marketStatus: 120,
  /** All 139 index levels in one call — no reason to be eager. */
  indices: 180,
  /**
   * Quotes are daily closes now, not ticks — so this is not precision, it is
   * how often a sector page pays to warm ten of them.
   *
   * The last traded price changes continuously, and it is what makes the
   * forming candle move between minute points. Twenty seconds because this is
   * the cheap endpoint — a few hundred bytes — and it is the one thing on the
   * page that genuinely benefits from being asked often. Three calls a minute
   * per share, shared across every viewer.
   */
  quote: 20,
  /** Daily bars only change once a day; the intraday tail is what moves. */
  candles: 900,
  /** Google News is the politeness-sensitive one: 3s floor, big result sets. */
  news: 900,
  /** The board-meeting calendar changes a few times a day at most. */
  events: 3_600,
  /** Constituents change on index reconstitution — a few times a year. */
  constituents: 86_400,
  /** Strikes move continuously; this is the one worth keeping short. */
  optionChain: 300,
  /**
   * The live session. The upstream publishes one point per minute, so asking
   * much more often returns an identical series — but a full sixty seconds
   * meant a poll could land just before a new point and show a chart two
   * minutes behind. Forty-five keeps the newest candle within a minute of real.
   */
  intraday: 45,
} as const;
