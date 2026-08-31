"use client";

import { useEffect, useRef, useState } from "react";

import type { IntradayCandle } from "@/lib/services/shares/queries";

export type LiveSession = {
  lastPrice: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  asOf: string | null;
  candles: IntradayCandle[];
  at: number;
};

/**
 * Poll one share's session while the page is open.
 *
 * Fifteen seconds. The upstream advances once a minute and the server caches
 * for thirty, so most polls return an identical payload — that is the point:
 * the cost of a poll is a few kilobytes from the edge, and it means the chart
 * is never more than one cache window behind. The upstream itself is still hit
 * at most twice a minute per symbol, however many browsers are asking.
 *
 * Three things this is careful about, all of them ways a naive poll misbehaves:
 *
 *  - It stops when the tab is hidden and catches up immediately on return.
 *    A phone left on this page overnight should not spend the night polling.
 *  - Each request aborts the one before it, so a slow response cannot land
 *    after a newer one and move the chart backwards.
 *  - A failed poll keeps the last good session rather than blanking the chart.
 *    A dropped connection should look like a chart that stopped updating, not
 *    like a share that stopped existing.
 */
export function useLiveSession(symbol: string, enabled: boolean, intervalMs = 15_000) {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [stale, setStale] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    const poll = async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`/api/live/${encodeURIComponent(symbol)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(String(response.status));

        const body = (await response.json()) as { ok: boolean } & LiveSession;
        if (cancelled) return;

        if (body.ok) {
          setSession(body);
          setStale(false);
        } else {
          setStale(true);
        }
      } catch (error) {
        // An abort is this hook replacing its own request, not a failure.
        if (!cancelled && (error as Error).name !== "AbortError") setStale(true);
      }
    };

    const start = () => {
      timer ??= setInterval(poll, intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void poll();
        start();
      } else {
        stop();
      }
    };

    void poll();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stop();
      abortRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [symbol, enabled, intervalMs]);

  return { session, stale };
}
