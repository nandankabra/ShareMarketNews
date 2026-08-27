"use server";

import { revalidatePath } from "next/cache";

import { failure, success, type ActionResult } from "@/lib/action-result";
import { requireAccess } from "@/lib/actions/guard";
import { SourceKey, type SourceKey as SourceKeyType } from "@/lib/db/enums";
import type { RunOutcome } from "@/lib/refresh/run-task";
import { refreshCorporateEvents } from "@/lib/refresh/tasks/corporate-events";
import { refreshDailyBars } from "@/lib/refresh/tasks/daily-snapshot";
import { refreshMarketStatus } from "@/lib/refresh/tasks/market-status";
import { refreshNewsSweep } from "@/lib/refresh/tasks/news";
import { refreshOptionChains } from "@/lib/refresh/tasks/option-chain";
import { refreshQuotes } from "@/lib/refresh/tasks/quotes";
import { refreshSectorConstituents, refreshSectorLevels } from "@/lib/refresh/tasks/sector-catalogue";

/**
 * Run one refresh task on demand.
 *
 * This calls exactly the same functions the poller schedules — that symmetry is
 * what makes "the poller is not running" a degraded mode rather than a broken
 * app. The poller lives on a home machine that is off most evenings, so this is
 * the normal way to catch up rather than an emergency lever.
 *
 * The per-source backoff in `runTask` is deliberately NOT bypassed. If an
 * upstream has told us to go away, clicking a button should not override that —
 * so a wedged source reports how long is left instead of being hammered.
 */

/** In-memory, per-source. Stops a double-click becoming two requests. */
const lastRun = new Map<string, number>();
const CLICK_COOLDOWN_MS = 60_000;

async function dispatch(source: SourceKeyType): Promise<RunOutcome> {
  switch (source) {
    case "NSE_MARKET_STATUS":
      return refreshMarketStatus();
    case "NSE_ALL_INDICES":
      return refreshSectorLevels();
    case "NIFTY_CONSTITUENTS":
      return refreshSectorConstituents();
    case "NSE_OPTION_CHAIN":
      return refreshOptionChains();
    case "YAHOO_QUOTES":
      return refreshQuotes();
    case "YAHOO_DAILY_BARS":
      return refreshDailyBars({ limit: 25 });
    case "GOOGLE_NEWS":
      return refreshNewsSweep();
    case "NSE_EVENT_CALENDAR":
    case "NSE_CORPORATE_ACTIONS": {
      const outcome = await refreshCorporateEvents();
      return outcome.calendar.status === "OK" ? outcome.calendar : outcome.actions;
    }
    default:
      return { status: "SKIPPED", reason: "no manual refresh for this source" };
  }
}

export async function refreshSource(rawSource: string): Promise<ActionResult<{ message: string }>> {
  const denied = await requireAccess();
  if (denied) return denied;

  const parsed = SourceKey.schema.safeParse(rawSource);
  if (!parsed.success) return failure("Unknown source.");
  const source = parsed.data;

  const previous = lastRun.get(source);
  if (previous && Date.now() - previous < CLICK_COOLDOWN_MS) {
    const seconds = Math.ceil((CLICK_COOLDOWN_MS - (Date.now() - previous)) / 1000);
    return failure(`Just ran — try again in ${seconds}s.`);
  }
  lastRun.set(source, Date.now());

  const outcome = await dispatch(source);

  revalidatePath("/health");
  revalidatePath("/");

  if (outcome.status === "OK") {
    return success({
      message: `${outcome.itemCount} item(s) in ${outcome.durationMs}ms${outcome.note ? ` — ${outcome.note}` : ""}`,
    });
  }
  if (outcome.status === "SKIPPED") return failure(outcome.reason);
  return failure(outcome.error);
}
