"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Notices when a story lands and refreshes the briefing under it.
 *
 * Watches the newest story across your watchlist.
 *
 * This used to watch `firstSeenAt` — when *we* first saw a story rather than
 * when it was published, so a piece published three hours ago but discovered
 * just now would light up, which is the honest meaning of "new to you". Holding
 * that needed a database. Freshness is now the publication time, so a story
 * already hours old when we find it arrives looking hours old.
 */
const POLL_MS = 30_000;

export function NewsPulse() {
  const router = useRouter();
  const seen = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function check() {
      try {
        const response = await fetch("/api/pulse", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) return;

        const data: { newestFirstSeenAt: string | null; freshCount: number } = await response.json();
        if (cancelled || !data.newestFirstSeenAt) return;

        // The first poll only establishes a baseline — otherwise every page
        // load would announce whatever was already there as breaking news.
        if (seen.current === null) {
          seen.current = data.newestFirstSeenAt;
          return;
        }

        if (data.newestFirstSeenAt !== seen.current) {
          seen.current = data.newestFirstSeenAt;
          toast("New stories found", {
            description: `${data.freshCount} in the last half hour. Refreshing the briefing.`,
          });
          router.refresh();
        }
      } catch {
        // A failed poll is not worth surfacing; the next one is 30s away.
      }
    }

    void check();
    const timer = setInterval(() => void check(), POLL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [router]);

  return null;
}
