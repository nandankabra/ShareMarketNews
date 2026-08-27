import { env } from "@/env";
import { istDayKey } from "@/lib/date/ist";
import { prisma } from "@/lib/prisma";
import { ProviderError } from "@/lib/providers/errors";
import { isCircuitOpen } from "@/lib/providers/circuit";
import { fetchBseHighLow, fetchBseQuote } from "@/lib/providers/bse";
import { fetchChart } from "@/lib/providers/yahoo";

import { runTask, type RunOutcome } from "../run-task";

/**
 * The only high-volume source, and therefore the only one with a budget.
 *
 * Shares are refreshed in tiers, resolved by a single query ordered by how
 * stale each row is:
 *
 *   A  watchlist, plus anything with an event dated today or tomorrow
 *   B  shares in a sector opened in the last two hours
 *   C  everything else, once a day after the close
 *
 * At the 1.2s politeness gap, a budget of twenty is roughly twenty-four
 * seconds of network inside a sixty-second tick — the loop is idle more than
 * half the time by construction, which is the point.
 */
export type QuoteTier = "A" | "B" | "C";

async function tierAShareIds(): Promise<string[]> {
  const today = istDayKey();
  const tomorrow = istDayKey(new Date(Date.now() + 86_400_000));

  const [watchlist, eventful] = await Promise.all([
    prisma.watchlistItem.findMany({ select: { shareId: true } }),
    prisma.corporateEvent.findMany({
      where: { eventDate: { in: [today, tomorrow] }, shareId: { not: null } },
      select: { shareId: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const item of watchlist) ids.add(item.shareId);
  for (const event of eventful) if (event.shareId) ids.add(event.shareId);
  return [...ids];
}

async function tierBShareIds(): Promise<string[]> {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const shares = await prisma.share.findMany({
    where: { lastViewedAt: { gte: since }, quoteUnavailable: false },
    select: { id: true },
  });
  return shares.map((share) => share.id);
}

/** Pick the stalest shares within the requested tiers, up to the budget. */
export async function selectQuoteTargets(tiers: QuoteTier[], budget: number): Promise<string[]> {
  const candidates: string[] = [];

  if (tiers.includes("A")) candidates.push(...(await tierAShareIds()));
  if (tiers.includes("B")) candidates.push(...(await tierBShareIds()));

  const unique = [...new Set(candidates)];

  if (unique.length >= budget) {
    // Order the shortlist by staleness so a large tier A still cycles fairly.
    const rows = await prisma.share.findMany({
      where: { id: { in: unique }, quoteUnavailable: false },
      orderBy: [{ quotedAt: { sort: "asc", nulls: "first" } }],
      take: budget,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  if (!tiers.includes("C")) return unique.slice(0, budget);

  const filler = await prisma.share.findMany({
    where: { quoteUnavailable: false, id: { notIn: unique.length ? unique : ["-"] } },
    orderBy: [{ quotedAt: { sort: "asc", nulls: "first" } }],
    take: budget - unique.length,
    select: { id: true },
  });

  return [...unique, ...filler.map((row) => row.id)];
}

export async function refreshQuotes(
  args: { tiers?: QuoteTier[]; budget?: number; marketOpen?: boolean; ignoreBackoff?: boolean } = {},
): Promise<RunOutcome> {
  const budget = args.budget ?? env.QUOTE_BUDGET_PER_TICK;
  const tiers = args.tiers ?? ["A", "B", "C"];
  const marketOpen = args.marketOpen ?? false;

  return runTask(
    "YAHOO_QUOTES",
    async (context) => {
      const ids = await selectQuoteTargets(tiers, budget);
      if (ids.length === 0) return { itemCount: 0, note: "nothing due" };

      const shares = await prisma.share.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, symbol: true, yahooSymbol: true, notFoundCount: true, bseScripCode: true,
          week52High: true,
        },
      });

      let updated = 0;
      let viaBse = 0;
      // Once Yahoo has told us to back off, asking it again for every share in
      // the batch burns the entire tick on requests we already know will be
      // refused. Check once, up front, and route the whole batch to BSE.
      let blocked = isCircuitOpen("query1.finance.yahoo.com");

      for (const share of shares) {
        if (blocked || context.expired()) break;

        try {
          const quote = await fetchChart(share.yahooSymbol, "5d", "1d");

          const change =
            quote.lastPrice != null && quote.previousClose != null
              ? quote.lastPrice - quote.previousClose
              : null;

          await prisma.share.update({
            where: { id: share.id },
            data: {
              lastPrice: quote.lastPrice,
              previousClose: quote.previousClose,
              dayChange: change,
              dayChangePercent:
                change != null && quote.previousClose ? (change / quote.previousClose) * 100 : null,
              dayHigh: quote.dayHigh,
              dayLow: quote.dayLow,
              week52High: quote.week52High,
              week52Low: quote.week52Low,
              volume: quote.volume,
              currency: quote.currency,
              quotedAt: quote.quotedAt ?? new Date(),
              quoteSource: "NSE",
              notFoundCount: 0,
            },
          });

          // One intraday row per successful poll, but only while the session is
          // actually running. Polling continues after the close for watchlist
          // shares, and without this guard every one of those writes another
          // copy of the same closing price — filling the table with rows that
          // describe nothing and drawing a flat overnight tail on every chart.
          if (marketOpen && quote.lastPrice != null) {
            const at = new Date(Math.floor(Date.now() / 60_000) * 60_000);
            await prisma.priceSnapshot.upsert({
              where: { shareId_interval_at: { shareId: share.id, interval: "INTRADAY", at } },
              update: { close: quote.lastPrice },
              create: {
                shareId: share.id,
                interval: "INTRADAY",
                at,
                open: quote.lastPrice,
                high: quote.dayHigh ?? quote.lastPrice,
                low: quote.dayLow ?? quote.lastPrice,
                close: quote.lastPrice,
                volume: quote.volume,
              },
            });
          }

          updated++;
        } catch (error) {
          if (!(error instanceof ProviderError)) throw error;

          if (error.kind === "NOT_FOUND") {
            const count = share.notFoundCount + 1;
            await prisma.share.update({
              where: { id: share.id },
              data: {
                notFoundCount: count,
                // Three strikes and the poller stops asking. A symbol Yahoo
                // does not list will not start existing on the fourth try.
                quoteUnavailable: count >= 3,
              },
            });
            continue;
          }

          if (error.kind === "BLOCKED") {
            // Yahoo has asked us to stop, and it means it for hours. Rather
            // than leave the whole panel priceless, fall back to BSE — a
            // different company's servers listing the same shares. Prices are
            // recorded as BSE and labelled on screen, because the two exchanges
            // do not print the same number and pretending otherwise would be a
            // small quiet lie.
            blocked = true;

            const recovered = await quoteViaBse(share);
            if (recovered) {
              updated++;
              viaBse++;
              continue;
            }

            if (updated === 0) throw error;
          }
        }
      }

      // Whatever Yahoo did not serve, try BSE for.
      if (blocked) {
        const done = new Set<string>();
        for (const share of shares) {
          if (context.expired()) break;
          if (done.has(share.id)) continue;
          done.add(share.id);
          if (await quoteViaBse(share)) {
            updated++;
            viaBse++;
          }
        }
      }

      if (updated === 0) {
        return { itemCount: 0, note: "no quotes available from either source" };
      }

      return {
        itemCount: updated,
        note: viaBse > 0 ? `${viaBse} via BSE — Yahoo is rate limiting` : undefined,
      };
    },
    { ignoreBackoff: args.ignoreBackoff },
  );
}

/**
 * A fallback price from BSE. Returns false when the share has no scrip code or
 * BSE has nothing for it, which is a normal outcome rather than an error.
 */
async function quoteViaBse(share: {
  id: string;
  bseScripCode: string | null;
  week52High?: number | null;
}): Promise<boolean> {
  if (!share.bseScripCode) return false;

  try {
    const quote = await fetchBseQuote(share.bseScripCode);
    if (quote.lastPrice == null) return false;

    // A second request, so only for shares that have no range yet. It barely
    // moves, and re-asking every poll would be waste dressed as freshness.
    let range: { week52High: number | null; week52Low: number | null } | null = null;
    if (share.week52High == null) {
      try {
        range = await fetchBseHighLow(share.bseScripCode);
      } catch {
        // A missing range is not a reason to drop a good price.
      }
    }

    await prisma.share.update({
      where: { id: share.id },
      data: {
        ...(range?.week52High != null ? { week52High: range.week52High, week52Low: range.week52Low } : {}),
        lastPrice: quote.lastPrice,
        previousClose: quote.previousClose,
        dayChange: quote.change,
        dayChangePercent: quote.changePercent,
        dayHigh: quote.dayHigh,
        dayLow: quote.dayLow,
        quotedAt: new Date(),
        quoteSource: "BSE",
      },
    });
    return true;
  } catch {
    return false;
  }
}
