"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { failure, success, type ActionResult } from "@/lib/action-result";
import { requireAccess } from "@/lib/actions/guard";

/**
 * Refresh one source.
 *
 * This used to run the poller's task for that source and write the result to
 * the database. There is no poller and no database, so "refresh" now means what
 * it always meant to you and no longer means anything else: drop the cached
 * answer, so the next page load asks upstream again.
 *
 * The cooldown survives the rewrite, and matters more than before. Every cached
 * entry is shared by every visitor, so dropping one is not a private act — it
 * sends the next render out to the upstream. A held-down button should not
 * become a burst.
 */
const TAGS: Record<string, string[]> = {
  NSE_MARKET_STATUS: ["market-status"],
  NSE_ALL_INDICES: ["all-indices"],
  NSE_HISTORICAL: ["history"],
  NSE_EVENT_CALENDAR: ["event-calendar"],
  NSE_OPTION_CHAIN: ["option-chain", "option-expiries"],
  NIFTY_CONSTITUENTS: ["constituents"],
  GOOGLE_NEWS: ["news"],
  BSE_DIRECTORY: ["bse-directory"],
  HEALTH: ["health-probe"],
};

/** In-memory, per-source. Stops a double-click becoming two requests. */
const lastRun = new Map<string, number>();
const CLICK_COOLDOWN_MS = 60_000;

export async function refreshSource(rawSource: string): Promise<ActionResult<{ message: string }>> {
  const denied = await requireAccess();
  if (denied) return denied;

  const source = rawSource.toUpperCase();
  const tags = TAGS[source];
  if (!tags) return failure(`Nothing to refresh for ${source}.`);

  const previous = lastRun.get(source);
  if (previous && Date.now() - previous < CLICK_COOLDOWN_MS) {
    const wait = Math.ceil((CLICK_COOLDOWN_MS - (Date.now() - previous)) / 1000);
    return failure(`Just refreshed — try again in ${wait}s.`);
  }
  lastRun.set(source, Date.now());

  // `expire: 0` rather than the recommended "max". "max" is
  // stale-while-revalidate: the next visitor still sees the old value while a
  // fresh one loads behind it, which is the right default but the wrong
  // behaviour for a button labelled "Refresh now" — it would look like nothing
  // happened. The cooldown above is what keeps this from being impolite.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });

  // The health probe caches its own summary, so a source refresh that left it
  // alone would show the old row and read as a no-op.
  if (source !== "HEALTH") revalidateTag("health-probe", { expire: 0 });

  revalidatePath("/health");
  revalidatePath("/");

  return success({ message: "Cleared — the next load will fetch it fresh." });
}
