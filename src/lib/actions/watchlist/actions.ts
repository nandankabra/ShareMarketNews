"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, success, type ActionResult } from "@/lib/action-result";
import { requireAccess } from "@/lib/actions/guard";
import { prisma } from "@/lib/prisma";
import { ProviderError } from "@/lib/providers/errors";
import { fetchChart, searchShares } from "@/lib/providers/yahoo";
import { toYahooSymbol } from "@/lib/providers/yahoo/symbol";

const symbolSchema = z
  .string()
  .trim()
  .min(1, "Enter a symbol")
  .max(24, "That is not an NSE symbol")
  .transform((value) => value.toUpperCase());

function refresh(): void {
  revalidatePath("/watchlist");
  revalidatePath("/");
}

/**
 * Add a share to the watchlist.
 *
 * `addedPrice` is stamped at the moment of adding, because that is what makes
 * the movement column mean "return since I noticed this" rather than "return
 * since a previous close I never chose". Where no quote is available the field
 * stays null and the column shows a dash — a fabricated entry price would make
 * every later number wrong.
 */
export async function addToWatchlist(rawSymbol: string): Promise<ActionResult<{ symbol: string }>> {
  const denied = await requireAccess();
  if (denied) return denied;

  const parsed = symbolSchema.safeParse(rawSymbol);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Invalid symbol");
  const symbol = parsed.data;

  let share = await prisma.share.findUnique({ where: { symbol } });

  // Not in the tracked universe — ask the provider whether it exists at all.
  if (!share) {
    try {
      const hits = await searchShares(symbol, 5);
      const match =
        hits.find((hit) => hit.nseSymbol === symbol) ??
        hits.find((hit) => hit.nseSymbol.startsWith(symbol));

      if (!match) return failure(`${symbol} is not a listed NSE equity we can find.`);

      share = await prisma.share.create({
        data: {
          symbol: match.nseSymbol,
          yahooSymbol: match.yahooSymbol,
          name: match.name,
          yahooSector: match.sector,
          yahooIndustry: match.industry,
        },
      });
    } catch (error) {
      if (error instanceof ProviderError) {
        return failure(
          `Could not look up ${symbol} — the search provider is unavailable (${error.kind.toLowerCase()}). ` +
            `Shares already in a tracked sector can still be added.`,
        );
      }
      throw error;
    }
  }

  const existing = await prisma.watchlistItem.findUnique({ where: { shareId: share.id } });
  if (existing) return failure(`${symbol} is already on your watchlist.`);

  // Prefer the cached quote; only reach for the network when there isn't one.
  let addedPrice = share.lastPrice;
  if (addedPrice == null) {
    try {
      const quote = await fetchChart(share.yahooSymbol ?? toYahooSymbol(symbol), "5d", "1d");
      addedPrice = quote.lastPrice;
      if (quote.lastPrice != null) {
        await prisma.share.update({
          where: { id: share.id },
          data: { lastPrice: quote.lastPrice, previousClose: quote.previousClose, quotedAt: new Date() },
        });
      }
    } catch {
      // Adding must not fail because a price could not be fetched. The share
      // goes on the list; the entry price fills in on the next poll.
      addedPrice = null;
    }
  }

  const count = await prisma.watchlistItem.count();
  await prisma.watchlistItem.create({
    data: { shareId: share.id, addedPrice, sortIndex: count },
  });

  refresh();
  return success({ symbol });
}

export async function removeFromWatchlist(shareId: string): Promise<ActionResult> {
  const denied = await requireAccess();
  if (denied) return denied;

  const deleted = await prisma.watchlistItem.deleteMany({ where: { shareId } });
  if (deleted.count === 0) return failure("That share was not on your watchlist.");
  refresh();
  return success();
}

const noteSchema = z.string().trim().max(200, "Keep the note under 200 characters");

export async function updateWatchlistNote(shareId: string, rawNote: string): Promise<ActionResult> {
  const denied = await requireAccess();
  if (denied) return denied;

  const parsed = noteSchema.safeParse(rawNote);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Invalid note");

  const updated = await prisma.watchlistItem.updateMany({
    where: { shareId },
    data: { note: parsed.data || null },
  });
  if (updated.count === 0) return failure("That share is not on your watchlist.");

  refresh();
  return success();
}

/**
 * Re-stamp the entry price to the current quote.
 *
 * For the case where a share was added while quotes were unavailable, so the
 * movement column has nothing to measure from.
 */
export async function resetAddedPrice(shareId: string): Promise<ActionResult> {
  const denied = await requireAccess();
  if (denied) return denied;

  const share = await prisma.share.findUnique({ where: { id: shareId } });
  if (!share) return failure("Unknown share.");
  if (share.lastPrice == null) return failure("No quote available to measure from yet.");

  await prisma.watchlistItem.updateMany({ where: { shareId }, data: { addedPrice: share.lastPrice } });
  refresh();
  return success();
}
