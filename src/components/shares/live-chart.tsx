"use client";

import type { IntradayCandle, ShareCandle } from "@/lib/services/shares/queries";
import type { LevelSet } from "@/lib/ta/levels";

import { CandleChart } from "./candle-chart";
import { useSharedSession } from "./live-session";

/**
 * The chart, fed by the shared poller.
 *
 * The server's render is the starting point; each poll replaces the intraday
 * array, and the chart applies the difference to the series it already holds
 * rather than redrawing. Zoom and pan survive, and the newest candle grows in
 * place the way a broker's does.
 */
export function LiveChart({
  candles,
  intraday,
  levels,
}: {
  candles: ShareCandle[];
  intraday: IntradayCandle[];
  levels: LevelSet | null;
}) {
  const { session } = useSharedSession();
  return <CandleChart candles={candles} intraday={session?.candles ?? intraday} levels={levels} />;
}
