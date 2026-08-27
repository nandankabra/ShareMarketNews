import { env } from "@/env";
import { classifyHeadline } from "@/lib/news/classify";
import { isRelevantHeadline } from "@/lib/news/relevance";
import { prisma } from "@/lib/prisma";
import { fetchNews } from "@/lib/providers/googlenews";
import type { NewsWindow } from "@/lib/providers/googlenews";
import { ProviderError } from "@/lib/providers/errors";

import { runTask, type RunOutcome } from "../run-task";

/**
 * News is on-demand-first and never bulk. Four hundred and fifty RSS queries
 * would be both abusive and pointless — most of them would come back empty.
 *
 * The default window is a full week, which is the retention the panel is built
 * around: seven days is enough for the share page to show real coverage and
 * enough for the "heaviest news days" comparison to have something to measure.
 */
export async function refreshNewsForShares(
  shareIds: string[],
  window: NewsWindow = "7d",
  options: { ignoreBackoff?: boolean } = {},
): Promise<RunOutcome> {
  return runTask(
    "GOOGLE_NEWS",
    async () => {
      const shares = await prisma.share.findMany({
        where: { id: { in: shareIds } },
        select: { id: true, symbol: true, name: true },
      });

      let articles = 0;
      let mentions = 0;
      let failures = 0;
      let dropped = 0;

      for (const share of shares) {
        try {
          const items = await fetchNews(share.name, window);

          for (const item of items) {
            // Google pads a thin feed with unrelated stories rather than
            // returning fewer. Filtering here keeps the news counts the notice
            // rule scores on from being inflated by weather bulletins.
            if (!isRelevantHeadline(item.title, share.name, share.symbol)) {
              dropped++;
              continue;
            }

            const classification = classifyHeadline(item.title);

            const article = await prisma.newsArticle.upsert({
              where: { dedupKey: item.dedupKey },
              update: {
                // Title and classification can improve as the story is edited,
                // but firstSeenAt must never move — it is what drives the live
                // highlight, and resetting it would make old news blink again.
                title: item.title,
                category: classification.category,
                polarity: classification.polarity,
                confidence: classification.confidence,
                matchedTerms: classification.matchedTerms.join(", "),
              },
              create: {
                dedupKey: item.dedupKey,
                title: item.title,
                url: item.url,
                source: item.source,
                publishedAt: item.publishedAt,
                category: classification.category,
                polarity: classification.polarity,
                confidence: classification.confidence,
                matchedTerms: classification.matchedTerms.join(", "),
              },
            });
            articles++;

            await prisma.shareNewsMention.upsert({
              where: { shareId_articleId: { shareId: share.id, articleId: article.id } },
              update: {},
              create: { shareId: share.id, articleId: article.id, matchedQuery: share.name },
            });
            mentions++;
          }
        } catch (error) {
          failures++;
          if (!(error instanceof ProviderError)) throw error;
        }
      }

      if (failures > 0 && failures === shares.length) {
        throw new ProviderError({
          kind: "NETWORK",
          source: "GOOGLE_NEWS",
          message: `news failed for all ${failures} share(s)`,
        });
      }

      return {
        itemCount: mentions,
        note:
          `${articles} articles across ${shares.length - failures} share(s)` +
          (dropped > 0 ? ` · ${dropped} off-topic dropped` : ""),
      };
    },
    options,
  );
}

/** The background sweep: watchlist first, then whatever is most stale. */
export async function refreshNewsSweep(
  options: { ignoreBackoff?: boolean } = {},
): Promise<RunOutcome> {
  const budget = env.NEWS_BUDGET_PER_RUN;

  const watchlist = await prisma.watchlistItem.findMany({
    select: { shareId: true },
    take: budget,
  });

  const ids = watchlist.map((item) => item.shareId);

  if (ids.length < budget) {
    // Fill the remaining budget with shares that have an event in the next two
    // days — the ones the briefing is about to put at the top.
    const soon = await prisma.corporateEvent.findMany({
      where: { shareId: { not: null } },
      orderBy: { eventDate: "asc" },
      select: { shareId: true },
      take: budget * 3,
    });

    for (const event of soon) {
      if (!event.shareId || ids.includes(event.shareId)) continue;
      ids.push(event.shareId);
      if (ids.length >= budget) break;
    }
  }

  if (ids.length === 0) return { status: "SKIPPED", reason: "nothing to sweep yet" };
  return refreshNewsForShares(ids, "7d", options);
}

/** Keep at least a week; the default of 30 days feeds the reaction stats. */
export async function pruneNews(): Promise<number> {
  const cutoff = new Date(Date.now() - env.NEWS_RETENTION_DAYS * 86_400_000);
  const result = await prisma.newsArticle.deleteMany({
    where: { publishedAt: { lt: cutoff } },
  });
  return result.count;
}
