import "server-only";

import { cookies } from "next/headers";
import { z } from "zod";

/**
 * The watchlist, in a cookie.
 *
 * It used to be a table, which is what you want when several people each have
 * their own list. This panel has one user and no accounts, and the list is
 * small, private and cheap to carry — so the browser is a better home for it
 * than a database whose only remaining job would be holding it.
 *
 * Two real consequences, neither hidden from the user:
 *  - the list lives in *this* browser, so it does not follow you to your phone
 *  - clearing site data clears it
 *
 * `addedPrice` is the reason each entry stores more than a symbol: "movement
 * since you started watching" is measured from the price at the moment you
 * added it, not from yesterday's close.
 */
const COOKIE = "wd_watchlist";

/** Roughly the 4KB cookie ceiling, minus headroom for the rest of the jar. */
const MAX_ENTRIES = 60;

const entrySchema = z.object({
  s: z.string().min(1).max(24),
  n: z.string().max(120).nullable().default(null),
  p: z.number().nullable().default(null),
  t: z.number(),
});

const listSchema = z.array(entrySchema).max(MAX_ENTRIES);

export type WatchEntry = {
  symbol: string;
  note: string | null;
  addedPrice: number | null;
  addedAt: number;
};

/** Short keys on purpose — this is serialised into a 4KB budget. */
function toEntry(row: z.infer<typeof entrySchema>): WatchEntry {
  return { symbol: row.s, note: row.n, addedPrice: row.p, addedAt: row.t };
}

function toRow(entry: WatchEntry) {
  return { s: entry.symbol, n: entry.note, p: entry.addedPrice, t: entry.addedAt };
}

export async function readWatchlist(): Promise<WatchEntry[]> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return [];

  try {
    const parsed = listSchema.safeParse(JSON.parse(raw));
    // A malformed cookie is treated as an empty list rather than an error: it
    // is user-controlled input that only this app writes, so the only way to
    // see one is corruption or a format change, and neither is worth a 500 on
    // every page.
    return parsed.success ? parsed.data.map(toEntry) : [];
  } catch {
    return [];
  }
}

export async function writeWatchlist(entries: WatchEntry[]): Promise<void> {
  const trimmed = entries.slice(0, MAX_ENTRIES).map(toRow);
  (await cookies()).set(COOKIE, JSON.stringify(trimmed), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function isWatched(symbol: string): Promise<boolean> {
  const list = await readWatchlist();
  return list.some((entry) => entry.symbol === symbol.toUpperCase());
}
