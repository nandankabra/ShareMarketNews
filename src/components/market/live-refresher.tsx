"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a live page moving.
 *
 * The chart is server-rendered, so "live" means asking the server for a newer
 * render rather than streaming ticks into the browser. `router.refresh()` does
 * exactly that: it re-fetches this route's server components and reconciles
 * them in place, so the candles advance without the page flashing or losing
 * scroll position.
 *
 * Sixty seconds because the upstream publishes one point per minute — polling
 * faster would redraw the same bar. And because the fetch behind it is cached
 * for the same window, ten people watching one share still cost one request a
 * minute between them.
 *
 * Pauses when the tab is hidden. A phone left open on this page overnight
 * should not spend the night polling.
 */
export function LiveRefresher({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      timer ??= setInterval(() => router.refresh(), intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Catch up immediately — a tab returned to after ten minutes should not
        // show a ten-minute-old chart for another minute.
        router.refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
