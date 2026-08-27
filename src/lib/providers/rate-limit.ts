import { env } from "@/env";

/**
 * A per-host serialized queue with a minimum gap between requests.
 *
 * This is the single choke point for every outbound call the app makes. There
 * is no parallel fan-out anywhere in the codebase: refreshing four hundred
 * shares is a sequential drip through here, not a Promise.all. That is the
 * whole reason a personal tool can read these free, unofficial endpoints
 * without behaving like a scraper.
 *
 * The floors below are constants, not configuration. POLITE_MIN_GAP_MS can
 * raise them on a flaky connection but never lower them — the env knob exists
 * to slow the app down, which is the only direction worth allowing.
 */
const HOST_FLOOR_MS: Record<string, number> = {
  "query1.finance.yahoo.com": 1_200,
  "query2.finance.yahoo.com": 1_200,
  // NSE has the most aggressive bot defences of the four. A burst here does not
  // just get rate limited, it invalidates the session cookie.
  "www.nseindia.com": 2_000,
  "www.niftyindices.com": 2_000,
  // Touched rarely, and the easiest of the four to get blocked on.
  "news.google.com": 3_000,
};

const DEFAULT_FLOOR_MS = 2_000;

type HostState = { chain: Promise<void>; lastStartedAt: number };

const hosts = new Map<string, HostState>();

function gapFor(host: string): number {
  return Math.max(HOST_FLOOR_MS[host] ?? DEFAULT_FLOOR_MS, env.POLITE_MIN_GAP_MS);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `task` after this host's previous request has finished and the minimum
 * gap has elapsed. Callers await the result as if it were a plain fetch.
 */
export function scheduleForHost<T>(host: string, task: () => Promise<T>): Promise<T> {
  const state = hosts.get(host) ?? { chain: Promise.resolve(), lastStartedAt: 0 };
  hosts.set(host, state);

  const result = state.chain.then(async () => {
    const wait = state.lastStartedAt + gapFor(host) - Date.now();
    if (wait > 0) await sleep(wait);
    state.lastStartedAt = Date.now();
    return task();
  });

  // The chain must not reject, or one failure would poison every later request
  // to that host. Failures propagate through `result` to the caller instead.
  state.chain = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
}

/** Exposed for the health page, so the politeness budget is visible. */
export function hostFloors(): Record<string, number> {
  return { ...HOST_FLOOR_MS };
}
