import "server-only";

import { istToday } from "@/lib/date/ist";
import { prisma } from "@/lib/prisma";

/** Header state: is the market open, and where is the Nifty. */
export async function getMarketHeader() {
  const [snapshot, quoteFetch] = await Promise.all([
    prisma.marketSnapshot.findUnique({ where: { tradeDate: istToday() } }),
    prisma.sourceFetch.findUnique({ where: { source: "YAHOO_QUOTES" } }),
  ]);

  return {
    status: snapshot?.status ?? "Unknown",
    isOpen: (snapshot?.status ?? "").toLowerCase() === "open",
    niftyLevel: snapshot?.niftyLevel ?? null,
    niftyChangePercent: snapshot?.niftyChangePercent ?? null,
    capturedAt: snapshot?.capturedAt ?? null,
    quotesLastSuccessAt: quoteFetch?.lastSuccessAt ?? null,
  };
}
