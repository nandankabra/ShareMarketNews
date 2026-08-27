/**
 * End-to-end refresh check against a scratch database.
 *
 *   DATABASE_URL="file:./smoke.db" npx tsx scripts/smoke-refresh.ts
 *
 * Runs every task once, in dependency order, against an empty database and
 * asserts that real rows land. This covers the wiring the unit tests
 * deliberately skip: they test pure parsers and pure rules, so nothing else
 * proves that a parsed payload actually reaches a table.
 *
 * Refuses to run against the real database — it is destructive by design, and
 * a smoke test that quietly rewrote your data would be worse than no test.
 */
import "dotenv/config";

import { env } from "@/env";
import { istToday } from "@/lib/date/ist";
import { ensurePragmas, prisma } from "@/lib/prisma";
import { getBriefing } from "@/lib/briefing/build";
import type { RunOutcome } from "@/lib/refresh/run-task";
import { refreshCorporateEvents } from "@/lib/refresh/tasks/corporate-events";
import { refreshMarketStatus } from "@/lib/refresh/tasks/market-status";
import { refreshNewsSweep } from "@/lib/refresh/tasks/news";
import { refreshOptionChains } from "@/lib/refresh/tasks/option-chain";
import { refreshSectorConstituents, refreshSectorLevels } from "@/lib/refresh/tasks/sector-catalogue";

if (!env.DATABASE_URL.includes("smoke")) {
  console.error(
    'Refusing to run: this rewrites data.\n  DATABASE_URL="file:./smoke.db" npx tsx scripts/smoke-refresh.ts',
  );
  process.exit(1);
}

let failures = 0;

function step(label: string, outcome: RunOutcome): void {
  if (outcome.status === "OK") {
    console.log(`  ✓ ${label.padEnd(20)} ${outcome.itemCount} item(s)${outcome.note ? ` — ${outcome.note}` : ""}`);
  } else if (outcome.status === "SKIPPED") {
    console.log(`  · ${label.padEnd(20)} skipped — ${outcome.reason}`);
  } else {
    console.log(`  ✗ ${label.padEnd(20)} ${outcome.error}`);
    failures++;
  }
}

/**
 * Soft assertions. A count of zero is not always a bug — an empty event
 * calendar on a Sunday is correct — so each check says whether it is fatal.
 */
function expect(label: string, actual: number, minimum: number, fatal: boolean): void {
  const ok = actual >= minimum;
  const mark = ok ? "✓" : fatal ? "✗" : "!";
  console.log(`  ${mark} ${label.padEnd(24)} ${actual} (expected >= ${minimum})`);
  if (!ok && fatal) failures++;
}

async function main(): Promise<void> {
  await ensurePragmas();

  console.log("\nRunning every task once\n");
  step("marketStatus", await refreshMarketStatus({ ignoreBackoff: true }));
  step("sectorLevels", await refreshSectorLevels({ ignoreBackoff: true }));
  step("constituents", await refreshSectorConstituents({ ignoreBackoff: true }));

  const events = await refreshCorporateEvents({ ignoreBackoff: true });
  step("eventCalendar", events.calendar);
  step("corporateActions", events.actions);

  step("optionChain", await refreshOptionChains({ ignoreBackoff: true }));
  step("news", await refreshNewsSweep({ ignoreBackoff: true }));

  console.log("\nChecking what landed\n");
  const [sectors, shares, memberships, corporate, articles, mentions, chains, strikes] =
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

  expect("sectors", sectors, 16, true);
  expect("shares", shares, 50, true);
  expect("memberships", memberships, 50, true);
  expect("corporate events", corporate, 1, false);
  expect("news articles", articles, 1, false);
  expect("share mentions", mentions, 1, false);
  expect("option snapshots", chains, 1, false);
  expect("option strikes", strikes, 20, false);

  console.log("\nBriefing\n");
  const briefing = await getBriefing();
  const entries = [
    ...briefing.happeningToday,
    ...briefing.tomorrowEntries,
    ...briefing.movingOrInNews,
  ];
  console.log(`  ${briefing.scanned} scanned, ${entries.length} flagged for ${istToday()}`);
  for (const entry of entries.slice(0, 10)) {
    const reasons = entry.notice.reasons.map((reason) => reason.label).join(", ");
    console.log(`    ${entry.notice.band.padEnd(6)} ${entry.share.symbol.padEnd(12)} ${reasons}`);
  }

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
  if (failures > 0) process.exitCode = 1;
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
