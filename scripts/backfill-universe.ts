/**
 * Cold-start backfill.
 *
 *   npx tsx scripts/backfill-universe.ts [--skip-quotes] [--news N]
 *
 * Runs each refresh task once, in dependency order, so a fresh database has a
 * real universe to render. Safe to re-run — every task upserts.
 *
 * This is the same code the poller runs; it is only the schedule that differs.
 */
import "dotenv/config";

import { ensurePragmas, prisma } from "@/lib/prisma";
import { refreshCorporateEvents } from "@/lib/refresh/tasks/corporate-events";
import { refreshMarketStatus } from "@/lib/refresh/tasks/market-status";
import { refreshNewsSweep } from "@/lib/refresh/tasks/news";
import { refreshOptionChains } from "@/lib/refresh/tasks/option-chain";
import { refreshQuotes } from "@/lib/refresh/tasks/quotes";
import { refreshSectorConstituents, refreshSectorLevels } from "@/lib/refresh/tasks/sector-catalogue";
import type { RunOutcome } from "@/lib/refresh/run-task";

const args = process.argv.slice(2);
const skipQuotes = args.includes("--skip-quotes");
const quoteBudget = Number(args[args.indexOf("--quotes") + 1]) || 40;

function report(label: string, outcome: RunOutcome): void {
  if (outcome.status === "OK") {
    console.log(`  ✓ ${label}: ${outcome.itemCount} item(s) in ${outcome.durationMs}ms${outcome.note ? ` — ${outcome.note}` : ""}`);
  } else if (outcome.status === "SKIPPED") {
    console.log(`  · ${label}: skipped — ${outcome.reason}`);
  } else {
    console.log(`  ✗ ${label}: ${outcome.error}`);
  }
}

async function main(): Promise<void> {
  await ensurePragmas();

  console.log("\nMarket status");
  report("marketStatus", await refreshMarketStatus({ ignoreBackoff: true }));

  console.log("\nSector levels");
  report("allIndices", await refreshSectorLevels({ ignoreBackoff: true }));

  console.log("\nSector constituents (this walks 16 index files — give it a minute)");
  report("constituents", await refreshSectorConstituents({ ignoreBackoff: true }));

  console.log("\nCorporate events");
  const events = await refreshCorporateEvents({ ignoreBackoff: true });
  report("eventCalendar", events.calendar);
  report("corporateActions", events.actions);

  console.log("\nOption chains");
  report("optionChain", await refreshOptionChains({ ignoreBackoff: true }));

  console.log("\nNews (a full week per share)");
  report("news", await refreshNewsSweep({ ignoreBackoff: true }));

  if (!skipQuotes) {
    console.log(`\nQuotes (budget ${quoteBudget})`);
    report("quotes", await refreshQuotes({ budget: quoteBudget, ignoreBackoff: true }));
  } else {
    console.log("\nQuotes: skipped by flag");
  }

  const [sectors, shares, memberships, events2, articles, mentions, chains, strikes] =
    await Promise.all([
      prisma.sector.count(),
      prisma.share.count(),
      prisma.sectorMembership.count(),
      prisma.corporateEvent.count(),
      prisma.newsArticle.count(),
      prisma.shareNewsMention.count(),
      prisma.optionChainSnapshot.count(),
      prisma.optionStrike.count(),
    ]);

  console.log("\n─── universe ───────────────────────────────");
  console.log(`  sectors ............ ${sectors}`);
  console.log(`  shares ............. ${shares}`);
  console.log(`  memberships ........ ${memberships}`);
  console.log(`  corporate events ... ${events2}`);
  console.log(`  news articles ...... ${articles}`);
  console.log(`  share mentions ..... ${mentions}`);
  console.log(`  option snapshots ... ${chains}`);
  console.log(`  option strikes ..... ${strikes}`);
  console.log("");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
