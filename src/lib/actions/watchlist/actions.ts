"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, success, type ActionResult } from "@/lib/action-result";
import { requireAccess } from "@/lib/actions/guard";
import { analyse } from "@/lib/live/analysis";
import { liveHistory } from "@/lib/live/sources";
import type { Candle } from "@/lib/ta/types";
import { readWatchlist, writeWatchlist } from "@/lib/watchlist/store";

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

/** The latest close, from the same bars the chart is drawn from. */
async function currentPrice(symbol: string): Promise<number | null> {
  const history = await liveHistory(symbol);
  if (!history.ok) return null;

  const candles: Candle[] = history.data.map((bar) => ({
    t: new Date(`${bar.day}T00:00:00.000Z`).getTime(),
    o: bar.open, h: bar.high, l: bar.low, c: bar.close, v: bar.volume,
  }));

  return analyse(candles).close;
}

/**
 * Add a share to the watchlist.
 *
 * `addedPrice` is stamped at the moment of adding, because that is what makes
 * the movement column mean "return since I noticed this" rather than "return
 * since a previous close I never chose". Where no price is available the field
 * stays null and the column shows a dash — a fabricated entry price would make
 * every later number wrong.
 *
 * Adding also verifies the symbol exists, by requiring that NSE returns bars
 * for it. That is the same check the share page makes, so a symbol that can be
 * added is a symbol that has a page.
 */
export async function addToWatchlist(rawSymbol: string): Promise<ActionResult<{ symbol: string }>> {
  const denied = await requireAccess();
  if (denied) return denied;

  const parsed = symbolSchema.safeParse(rawSymbol);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Invalid symbol");
  const symbol = parsed.data;

  const existing = await readWatchlist();
  if (existing.some((entry) => entry.symbol === symbol)) {
    return failure(`${symbol} is already on your watchlist.`);
  }
  if (existing.length >= 60) {
    return failure("The watchlist is full — it is stored in a cookie, which caps at 60 entries.");
  }

  const history = await liveHistory(symbol);
  if (!history.ok) {
    return failure(`NSE has no daily data for ${symbol}. Check the symbol.`);
  }

  await writeWatchlist([
    ...existing,
    { symbol, note: null, addedPrice: await currentPrice(symbol), addedAt: Date.now() },
  ]);

  refresh();
  return success({ symbol });
}

export async function removeFromWatchlist(shareId: string): Promise<ActionResult> {
  const denied = await requireAccess();
  if (denied) return denied;

  const existing = await readWatchlist();
  const remaining = existing.filter((entry) => entry.symbol !== shareId.toUpperCase());
  if (remaining.length === existing.length) return failure("That share was not on your watchlist.");

  await writeWatchlist(remaining);
  refresh();
  return success();
}

const noteSchema = z.string().trim().max(200, "Keep the note under 200 characters");

export async function updateWatchlistNote(shareId: string, rawNote: string): Promise<ActionResult> {
  const denied = await requireAccess();
  if (denied) return denied;

  const parsed = noteSchema.safeParse(rawNote);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Invalid note");

  const existing = await readWatchlist();
  const symbol = shareId.toUpperCase();
  if (!existing.some((entry) => entry.symbol === symbol)) {
    return failure("That share is not on your watchlist.");
  }

  await writeWatchlist(
    existing.map((entry) =>
      entry.symbol === symbol ? { ...entry, note: parsed.data || null } : entry,
    ),
  );

  refresh();
  return success();
}

/**
 * Re-stamp the entry price to the current one.
 *
 * For the case where a share was added while its data was unavailable, so the
 * movement column has nothing to measure from.
 */
export async function resetAddedPrice(shareId: string): Promise<ActionResult> {
  const denied = await requireAccess();
  if (denied) return denied;

  const symbol = shareId.toUpperCase();
  const existing = await readWatchlist();
  if (!existing.some((entry) => entry.symbol === symbol)) return failure("Unknown share.");

  const price = await currentPrice(symbol);
  if (price == null) return failure("No price available to measure from yet.");

  await writeWatchlist(
    existing.map((entry) => (entry.symbol === symbol ? { ...entry, addedPrice: price } : entry)),
  );

  refresh();
  return success();
}
