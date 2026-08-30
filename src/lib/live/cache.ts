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
 * layer exists to prevent. Caching the failure for one window is the polite
 * behaviour.
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

  return unstable_cache(wrapped, [key], {
    revalidate: revalidateSeconds,
    tags: [key],
  }) as (...args: A) => Promise<Live<T>>;
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
  /** One share's quote and its bars come from the same Yahoo response. */
  quote: 180,
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
} as const;
