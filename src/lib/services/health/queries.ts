import "server-only";

import { liveHealthProbe } from "@/lib/live/health";

export type SourceHealth = {
  source: string;
  label: string;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  itemCount: number | null;
  durationMs: number | null;
  consecutiveFailures: number;
  nextEligibleAt: Date | null;
};

/**
 * Which upstreams are answering, right now.
 *
 * This used to read the poller's bookkeeping: what it last tried, when it last
 * succeeded, how many times in a row it had failed. There is no poller and no
 * bookkeeping any more, so the page reports something more direct and, for
 * diagnosis, more useful — it calls each upstream and says what happened.
 *
 * Cached like everything else, so opening the health page repeatedly does not
 * become the thing that gets us rate limited.
 */
export async function listSourceHealth(): Promise<SourceHealth[]> {
  const probe = await liveHealthProbe();
  const rows = probe.ok ? probe.data.rows : [];
  const at = new Date(probe.at);

  return rows.map((row) => ({
    source: row.source,
    label: row.label,
    lastAttemptAt: at,
    lastSuccessAt: row.ok ? at : null,
    lastStatus: row.ok ? "OK" : "FAILED",
    lastError: row.ok ? null : row.detail,
    itemCount: row.itemCount,
    durationMs: row.ms,
    consecutiveFailures: row.ok ? 0 : 1,
    nextEligibleAt: null,
  }));
}

/**
 * What the app can currently see.
 *
 * Counts of stored rows are gone with the tables that held them. What is
 * meaningful now is how much each answering upstream returned, which is what
 * the probe already measured.
 */
export async function getUniverseStats() {
  const probe = await liveHealthProbe();
  const rows = probe.ok ? probe.data.rows : [];
  const by = (source: string) => rows.find((row) => row.source === source);

  return {
    sectors: 16,
    shares: by("BSE_DIRECTORY")?.itemCount ?? 0,
    quoted: by("BSE_DIRECTORY")?.itemCount ?? 0,
    memberships: by("NIFTY_CONSTITUENTS")?.itemCount ?? 0,
    events: by("NSE_EVENT_CALENDAR")?.itemCount ?? 0,
    articles: by("GOOGLE_NEWS")?.itemCount ?? 0,
    mentions: by("GOOGLE_NEWS")?.itemCount ?? 0,
    chains: by("NSE_OPTION_CHAIN")?.itemCount ?? 0,
    watchlist: 0,
    oldestNews: null as Date | null,
    working: rows.filter((row) => row.ok).length,
    total: rows.length,
  };
}

/**
 * There is no poller to check in any more — the app fetches inside the request.
 * "Running" now means the upstreams answered when last asked.
 */
export async function getPollerStatus() {
  const probe = await liveHealthProbe();
  const rows = probe.ok ? probe.data.rows : [];
  return {
    running: rows.length > 0 && rows.some((row) => row.ok),
    lastAttemptAt: new Date(probe.at),
  };
}
