import "dotenv/config";

import { env } from "@/env";
import { isLikelyMarketOpen, istToday } from "@/lib/date/ist";
import { ensurePragmas, prisma } from "@/lib/prisma";
import { openCircuits } from "@/lib/providers/circuit";
import { dueTasks, type FetchRow, type TaskName } from "@/lib/refresh/schedule";
import type { RunOutcome } from "@/lib/refresh/run-task";
import { refreshBseCodes } from "@/lib/refresh/tasks/bse-codes";
import { refreshCorporateEvents } from "@/lib/refresh/tasks/corporate-events";
import { pruneIntraday, refreshDailyBars } from "@/lib/refresh/tasks/daily-snapshot";
import { refreshMarketStatus } from "@/lib/refresh/tasks/market-status";
import { pruneNews, refreshNewsSweep } from "@/lib/refresh/tasks/news";
import { pruneOptionChains, refreshOptionChains } from "@/lib/refresh/tasks/option-chain";
import { refreshQuotes } from "@/lib/refresh/tasks/quotes";
import { refreshSectorConstituents, refreshSectorLevels } from "@/lib/refresh/tasks/sector-catalogue";

/**
 * The poller.
 *
 *   npm run poller
 *
 * A plain Node process that runs the same task functions the app's Refresh
 * button calls — only the schedule differs. That symmetry is what makes "the
 * poller isn't running" a degraded mode rather than a broken app: every page
 * still renders from the database, says how stale it is, and can refresh
 * in-process on demand.
 *
 * Tasks run strictly sequentially. There is no Promise.all anywhere in this
 * loop, by design: the whole politeness story depends on exactly one request
 * being in flight per host at a time.
 *
 * In production this runs on a home connection rather than in the cloud,
 * because NSE refuses datacenter IP ranges outright. See docs/HOSTING.md.
 */

let stopping = false;
let activeTick: Promise<void> | null = null;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function report(name: TaskName, outcome: RunOutcome): void {
  if (outcome.status === "OK") {
    log(`  ✓ ${name}: ${outcome.itemCount} in ${outcome.durationMs}ms${outcome.note ? ` — ${outcome.note}` : ""}`);
  } else if (outcome.status === "SKIPPED") {
    log(`  · ${name}: ${outcome.reason}`);
  } else {
    log(`  ✗ ${name}: ${outcome.error}`);
  }
}

async function marketIsOpen(): Promise<{ open: boolean; source: "nse" | "clock" }> {
  const snapshot = await prisma.marketSnapshot.findUnique({ where: { tradeDate: istToday() } });

  // Fresh enough to trust. Older than an hour and we fall back to the clock
  // rather than acting on a stale "Open" from this morning.
  if (snapshot && Date.now() - snapshot.capturedAt.getTime() < 60 * 60_000) {
    return { open: snapshot.status.toLowerCase() === "open", source: "nse" };
  }

  // The fallback knows nothing about trading holidays, which is exactly why it
  // is the fallback — and why /health says when it is in use.
  return { open: isLikelyMarketOpen(), source: "clock" };
}

async function runTaskByName(name: TaskName, marketOpen: boolean): Promise<void> {
  switch (name) {
    case "marketStatus":
      return report(name, await refreshMarketStatus());
    case "sectorLevels":
      return report(name, await refreshSectorLevels());
    case "sectorConstituents":
      return report(name, await refreshSectorConstituents());
    case "bseCodes":
      return report(name, await refreshBseCodes());
    case "corporateEvents": {
      const outcome = await refreshCorporateEvents();
      report("corporateEvents", outcome.calendar);
      report("corporateEvents", outcome.actions);
      return;
    }
    case "optionChain":
      return report(name, await refreshOptionChains());
    case "quotes":
      // While the market is shut only the watchlist and event-dated shares are
      // worth re-asking about; the other four hundred have not moved.
      return report(name, await refreshQuotes({ tiers: marketOpen ? ["A", "B", "C"] : ["A"], marketOpen }));
    case "news":
      return report(name, await refreshNewsSweep());
    case "dailyBars":
      // Sliced: a four-hundred-share universe drips through over several ticks
      // rather than monopolising one.
      return report(name, await refreshDailyBars({ limit: 25 }));
    case "prune": {
      const [news, chains, intraday] = await Promise.all([
        pruneNews(),
        pruneOptionChains(),
        pruneIntraday(env.INTRADAY_RETENTION_DAYS),
      ]);
      log(`  ✓ prune: ${news} article(s), ${chains} chain(s), ${intraday} intraday bar(s)`);
      return;
    }
  }
}

async function tick(): Promise<void> {
  const now = new Date();
  const { open, source } = await marketIsOpen();

  const rows = (await prisma.sourceFetch.findMany({
    select: { source: true, lastSuccessAt: true, nextEligibleAt: true },
  })) as FetchRow[];

  const due = dueTasks(now, open, rows);
  if (due.length === 0) return;

  log(`tick · market ${open ? "open" : "closed"} (${source}) · ${due.length} task(s): ${due.join(", ")}`);

  for (const name of due) {
    if (stopping) {
      log(`  · ${name}: skipped, shutting down`);
      break;
    }
    try {
      await runTaskByName(name, open);
    } catch (error) {
      // runTask already recorded the failure; this is only for a bug in the
      // dispatch itself, which must not take the loop down.
      log(`  ✗ ${name} threw outside its task wrapper: ${error instanceof Error ? error.message : error}`);
    }
  }

  const cooling = openCircuits();
  if (cooling.length > 0) {
    log(`  backing off: ${cooling.map((entry) => `${entry.host} ${entry.secondsRemaining}s`).join(", ")}`);
  }
}

async function main(): Promise<void> {
  await ensurePragmas();

  log("poller started");
  log(`  tick ${env.POLLER_TICK_MS}ms · quote budget ${env.QUOTE_BUDGET_PER_TICK}/tick · news ${env.NEWS_BUDGET_PER_RUN}/sweep`);
  log(`  option underlyings: ${env.OPTION_UNDERLYINGS.join(", ")} · ${env.OPTION_EXPIRY_DEPTH} expiry/expiries deep`);

  while (!stopping) {
    const startedAt = Date.now();

    activeTick = tick().catch((error) => {
      log(`tick failed: ${error instanceof Error ? error.message : error}`);
    });
    await activeTick;
    activeTick = null;

    if (stopping) break;

    // Sleep to the next tick boundary rather than a flat interval, so a long
    // tick does not push the whole schedule later and later.
    const elapsed = Date.now() - startedAt;
    await sleep(Math.max(1_000, env.POLLER_TICK_MS - elapsed));
  }

  log("poller stopped");
  await prisma.$disconnect();
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) {
    log(`${signal} again — exiting immediately`);
    process.exit(1);
  }

  stopping = true;
  log(`${signal} received — finishing the current tick, then stopping`);

  // Let the in-flight tick drain rather than tearing the connection out from
  // under a half-written batch.
  if (activeTick) await activeTick;
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  log(`unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
