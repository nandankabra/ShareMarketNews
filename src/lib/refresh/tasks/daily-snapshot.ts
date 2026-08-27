import { dayKeyToDate, istDayKey } from "@/lib/date/ist";
import { prisma } from "@/lib/prisma";
import { ProviderError } from "@/lib/providers/errors";
import { fetchChart } from "@/lib/providers/yahoo";

import { runTask, type RunOutcome } from "../run-task";

import { recomputeIndicators } from "./indicators";

/**
 * Post-close daily bars.
 *
 * Asks for a year at a time because the indicators need it: a 200-day moving
 * average cannot be computed from a month, and the support/resistance
 * clustering wants ~250 sessions of swing pivots to have anything to cluster.
 * One request per share covers all of it.
 *
 * Sliced across ticks — `limit` bounds how many shares one run will walk, so a
 * four-hundred-share universe drips through over several ticks rather than
 * monopolising one.
 */
export async function refreshDailyBars(
  args: { limit?: number; range?: "1y" | "2y"; ignoreBackoff?: boolean } = {},
): Promise<RunOutcome> {
  const limit = args.limit ?? 25;

  return runTask(
    "YAHOO_DAILY_BARS",
    async () => {
      // Oldest snapshot first, so every share gets a turn.
      const shares = await prisma.share.findMany({
        where: { quoteUnavailable: false },
        orderBy: [{ taAt: { sort: "asc", nulls: "first" } }],
        take: limit,
        select: { id: true, symbol: true, yahooSymbol: true },
      });

      let barsWritten = 0;
      let sharesDone = 0;
      let blocked = false;

      for (const share of shares) {
        if (blocked) break;

        try {
          const quote = await fetchChart(share.yahooSymbol, args.range ?? "1y", "1d");

          for (const bar of quote.bars) {
            // Normalise to IST midnight so a bar has one identity regardless of
            // the exchange timestamp's time-of-day.
            const at = dayKeyToDate(istDayKey(bar.at));

            await prisma.priceSnapshot.upsert({
              where: { shareId_interval_at: { shareId: share.id, interval: "DAILY", at } },
              update: { open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume },
              create: {
                shareId: share.id,
                interval: "DAILY",
                at,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
                volume: bar.volume,
              },
            });
            barsWritten++;
          }

          await recomputeIndicators(share.id);
          sharesDone++;
        } catch (error) {
          if (!(error instanceof ProviderError)) throw error;
          if (error.kind === "BLOCKED") {
            blocked = true;
            if (sharesDone === 0) throw error;
          }
        }
      }

      return {
        itemCount: barsWritten,
        note: `${sharesDone} share(s)${blocked ? " — stopped early, upstream backed us off" : ""}`,
      };
    },
    { ignoreBackoff: args.ignoreBackoff },
  );
}

/** Intraday rows exist for sparklines only; a week of them is plenty. */
export async function pruneIntraday(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const result = await prisma.priceSnapshot.deleteMany({
    where: { interval: "INTRADAY", at: { lt: cutoff } },
  });
  return result.count;
}
