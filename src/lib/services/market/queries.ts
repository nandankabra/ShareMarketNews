import "server-only";

import { liveIndexHistory, liveMarketStatus } from "@/lib/live/sources";
import type { ShareCandle } from "@/lib/services/shares/queries";

/**
 * Header state: is the market open, and where is the Nifty.
 *
 * Rendered in the app shell, so it runs on every page — which is exactly why
 * it is one cached call and not a fan-out. When NSE is unreachable the header
 * says "Unknown" rather than the page failing: the status bar is the least
 * important thing on any screen and has no business taking the rest down.
 */
export async function getMarketHeader() {
  const status = await liveMarketStatus();

  if (!status.ok) {
    return {
      status: "Unknown",
      isOpen: false,
      niftyLevel: null,
      niftyChangePercent: null,
      capturedAt: null,
      quotesLastSuccessAt: null,
      error: status.error,
    };
  }

  return {
    status: status.data.status,
    isOpen: status.data.isOpen,
    niftyLevel: status.data.niftyLevel,
    niftyChangePercent: status.data.niftyChangePercent,
    capturedAt: new Date(status.at),
    quotesLastSuccessAt: new Date(status.at),
    error: null as string | null,
  };
}

/** The index the header already reports, so the chart and the level agree. */
const NIFTY = "NIFTY 50";

export type IndexChart = {
  name: string;
  candles: ShareCandle[];
};

/**
 * Daily bars for the Nifty, for the chart on the briefing.
 *
 * Daily and not intraday because there is no intraday source that answers:
 * `chart-databyindex` returns an empty series for every spelling of the index
 * name, so the only index data NSE will part with is end-of-day. The header
 * carries the live level; this carries where it has been.
 *
 * Returns null rather than throwing so a missing chart costs the briefing
 * nothing — the page above it is the point.
 */
export async function getNiftyChart(): Promise<IndexChart | null> {
  const history = await liveIndexHistory(NIFTY);
  if (!history.ok || history.data.length === 0) return null;

  return {
    name: NIFTY,
    candles: history.data.map((bar) => ({
      time: bar.day,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    })),
  };
}
