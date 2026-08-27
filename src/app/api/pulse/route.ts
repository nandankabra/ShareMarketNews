import { NextResponse } from "next/server";

import { getNewsPulse } from "@/lib/services/briefing/queries";

/**
 * A deliberately tiny endpoint the briefing polls every thirty seconds.
 *
 * Returns one timestamp and a count — enough for the client to notice that
 * something arrived without re-fetching the page. A route handler rather than a
 * server action because this wants a cheap GET that can be cancelled with an
 * AbortController on unmount.
 *
 * Polling rather than a live socket: the read app is meant to run on a free
 * host that cannot hold a connection open. Self-hosted, this can become SSE
 * without the client changing shape.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const pulse = await getNewsPulse();
  return NextResponse.json(
    {
      newestFirstSeenAt: pulse.newestFirstSeenAt?.toISOString() ?? null,
      freshCount: pulse.freshCount,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
