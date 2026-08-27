/**
 * DEVELOPMENT ONLY — writes a synthetic price series to a scratch database.
 *
 *   DATABASE_URL="file:./demo.db" npx tsx scripts/dev-demo-bars.ts
 *
 * This exists to exercise the indicator and chart pipeline when the upstream
 * quote provider is unavailable. The bars are generated from a fixed seed and
 * are NOT market data.
 *
 * It refuses to run against the real database on purpose. Fabricated prices
 * sitting in the same table as real ones, looking identical, is exactly the
 * kind of quiet corruption that is impossible to notice later.
 */
import "dotenv/config";

import { env } from "@/env";
import { dayKeyToDate, istDayKey } from "@/lib/date/ist";
import { prisma } from "@/lib/prisma";
import { recomputeIndicators } from "@/lib/refresh/tasks/indicators";

if (!env.DATABASE_URL.includes("demo")) {
  console.error(
    "Refusing to run: DATABASE_URL must point at a scratch database with 'demo' in its name.\n" +
      "  DATABASE_URL=\"file:./demo.db\" npx tsx scripts/dev-demo-bars.ts",
  );
  process.exit(1);
}

/** Deterministic, so two runs produce the same chart. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

async function main(): Promise<void> {
  const shares = await prisma.share.findMany({ take: 12, orderBy: { symbol: "asc" } });
  if (shares.length === 0) {
    console.error("No shares — run db:seed and the constituents task against this database first.");
    process.exit(1);
  }

  const sessions = 280;
  let written = 0;

  for (const [index, share] of shares.entries()) {
    const random = lcg(20260827 + index * 7919);
    let price = 400 + random() * 3000;

    for (let day = sessions; day >= 0; day--) {
      const date = new Date(Date.now() - day * 86_400_000);
      // Skip weekends so the series looks like a real trading calendar.
      const weekday = date.getUTCDay();
      if (weekday === 0 || weekday === 6) continue;

      const drift = (random() - 0.48) * 0.028;
      const open = price;
      const close = Math.max(1, open * (1 + drift));
      const wick = open * 0.009;
      const high = Math.max(open, close) + random() * wick;
      const low = Math.min(open, close) - random() * wick;
      const volume = Math.round(500_000 + random() * 4_000_000);

      const at = dayKeyToDate(istDayKey(date));
      await prisma.priceSnapshot.upsert({
        where: { shareId_interval_at: { shareId: share.id, interval: "DAILY", at } },
        update: { open, high, low, close, volume },
        create: { shareId: share.id, interval: "DAILY", at, open, high, low, close, volume },
      });

      price = close;
      written++;
    }

    await prisma.share.update({
      where: { id: share.id },
      data: {
        lastPrice: price,
        previousClose: price * 0.994,
        dayChange: price * 0.006,
        dayChangePercent: 0.6,
        dayHigh: price * 1.004,
        dayLow: price * 0.991,
        volume: 2_400_000,
        quotedAt: new Date(),
      },
    });

    const ok = await recomputeIndicators(share.id);
    console.log(`  ${share.symbol.padEnd(12)} ${ok ? "indicators computed" : "too few bars"}`);
  }

  console.log(`\n${written} synthetic bars across ${shares.length} shares (SCRATCH DATABASE).`);
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
