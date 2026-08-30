import "server-only";

import { liveMarketStatus } from "@/lib/live/sources";

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
