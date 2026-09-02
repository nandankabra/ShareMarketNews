"use client";

import { useMemo } from "react";

import {
  applyLivePrice,
  mergeSessionPoints,
  toIntradayCandles,
  type LivePoint,
} from "@/lib/live/intraday";
import type { IntradayCandle, ShareCandle } from "@/lib/services/shares/queries";
import type { LevelSet } from "@/lib/ta/levels";

import { CandleChart } from "./candle-chart";
import { useSharedSession } from "./live-session";

/** The main chart's own interval. The grid below it is where other clocks live. */
const MINUTES = 5;

/**
 * The chart, fed by the shared poller.
 *
 * The server's render is the starting point; each poll replaces the session and
 * the chart applies the difference to the series it already holds rather than
 * redrawing. Zoom and pan survive, and the newest candle grows in place the way
 * a broker's does.
 *
 * Folding happens here rather than on the server so this chart is built from
 * the same merged points as the grid — published minutes plus the prices the
 * page has watched arrive. Two pipelines would eventually disagree about the
 * same bar, and the one on screen would be whichever component drew last.
 */
export function LiveChart({
  candles,
  intraday,
  points,
  initialLastPrice,
  levels,
}: {
  candles: ShareCandle[];
  /** The server's own fold, used until there is anything better to fold. */
  intraday: IntradayCandle[];
  points: LivePoint[];
  initialLastPrice: number | null;
  levels: LevelSet | null;
}) {
  const { session, ticks } = useSharedSession();

  const folded = useMemo<IntradayCandle[]>(() => {
    const merged = mergeSessionPoints(session?.points ?? points, ticks);
    if (merged.length === 0) return intraday;

    const lastPrice = session?.lastPrice ?? initialLastPrice;
    const at = session?.at ?? merged[merged.length - 1].at;

    return applyLivePrice(toIntradayCandles(merged, MINUTES), lastPrice, at, MINUTES).map((candle) => ({
      time: Math.floor(candle.t / 1000),
      open: candle.o,
      high: candle.h,
      low: candle.l,
      close: candle.c,
      volume: candle.v,
    }));
  }, [session, ticks, points, intraday, initialLastPrice]);

  return <CandleChart candles={candles} intraday={folded} levels={levels} />;
}
