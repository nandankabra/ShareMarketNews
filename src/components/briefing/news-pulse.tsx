"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Notices when a story lands and refreshes the briefing under it.
 *
 * Watches `firstSeenAt` — when the sweep found a story, not when it was
 * published. A piece published three hours ago that the poller only just
 * discovered is new to the reader, and should light up.
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
