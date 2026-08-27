import { NextResponse } from "next/server";

import { searchLocalShares } from "@/lib/services/watchlist/queries";

/**
 * Typeahead for the add-share box.
 *
 * A route handler rather than a server action: this wants a cheap GET that the
 * client can cancel with an AbortController on every keystroke, which is
 * exactly what actions are bad at.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchLocalShares(query);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
