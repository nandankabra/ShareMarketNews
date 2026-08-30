import "server-only";

import type { OiBuildup } from "@/lib/db/enums";
import { parseNseDate } from "@/lib/date/ist";
import { liveOptionChain, liveOptionExpiries } from "@/lib/live/sources";
import { activeStrikes, analyseChain, mostTraded } from "@/lib/options/analytics";

export type ChainStrike = {
  strikePrice: number;
  ceOi: number | null;
  ceOiChange: number | null;
  ceVolume: number | null;
  ceIv: number | null;
  ceLtp: number | null;
  ceBuildup: OiBuildup | null;
  peOi: number | null;
  peOiChange: number | null;
  peVolume: number | null;
  peIv: number | null;
  peLtp: number | null;
  peBuildup: OiBuildup | null;
  isAtm: boolean;
};

export type ChainView = {
  symbol: string;
  displayName: string;
  expiryDate: string;
  expiries: string[];
  capturedAt: Date;
  underlyingValue: number;
  atmStrike: number;
  atmIv: number | null;
  pcrOi: number;
  pcrVolume: number;
  maxPainStrike: number;
  oiSupport: number | null;
  oiResistance: number | null;
  totalCeOi: number;
  totalPeOi: number;
  strikes: ChainStrike[];
  mostTraded: Array<{
    strikePrice: number;
    side: "CE" | "PE";
    volume: number;
    oi: number | null;
    ltp: number | null;
    buildup: OiBuildup | null;
  }>;
};

const UNDERLYINGS: Record<string, string> = {
  NIFTY: "Nifty 50",
  BANKNIFTY: "Nifty Bank",
};

/**
 * The live chain for an underlying.
 *
 * Everything returned here is descriptive — what is open, where it is
 * concentrated, and how it moved. Nothing in this module produces a buy or
 * sell instruction, and the page that renders it says so on the screen.
 *
 * One change from the stored version worth naming: OI *change* is whatever NSE
 * reports against the previous session, not a difference between two of our own
 * captures. There is no previous capture to difference against any more.
 */
export async function getChainView(symbol: string, expiryDate?: string): Promise<ChainView | null> {
  const upper = symbol.toUpperCase();
  if (!(upper in UNDERLYINGS)) return null;

  const expiries = await liveOptionExpiries(upper);
  if (!expiries.ok || expiries.data.length === 0) return null;

  // Expiries arrive as NSE labels ("01-Sep-2026"); the UI and the URL both work
  // in day keys, so the label is matched back here rather than leaking out.
  const dayKeys = expiries.data
    .map((label) => ({ label, day: parseNseDate(label) }))
    .filter((entry): entry is { label: string; day: string } => entry.day != null);

  const wanted = expiryDate
    ? (dayKeys.find((entry) => entry.day === expiryDate) ?? dayKeys[0])
    : dayKeys[0];
  if (!wanted) return null;

  const chain = await liveOptionChain(upper, wanted.label);
  if (!chain.ok) return null;

  const analytics = analyseChain(chain.data);

  const strikes: ChainStrike[] = activeStrikes(analytics, 10).map((row) => ({
    strikePrice: row.strikePrice,
    ceOi: row.ce?.oi ?? null,
    ceOiChange: row.ce?.oiChange ?? null,
    ceVolume: row.ce?.volume ?? null,
    ceIv: row.ce?.iv ?? null,
    ceLtp: row.ce?.ltp ?? null,
    ceBuildup: row.ceBuildup,
    peOi: row.pe?.oi ?? null,
    peOiChange: row.pe?.oiChange ?? null,
    peVolume: row.pe?.volume ?? null,
    peIv: row.pe?.iv ?? null,
    peLtp: row.pe?.ltp ?? null,
    peBuildup: row.peBuildup,
    isAtm: row.isAtm,
  }));

  return {
    symbol: upper,
    displayName: UNDERLYINGS[upper],
    expiryDate: wanted.day,
    expiries: dayKeys.map((entry) => entry.day),
    capturedAt: new Date(chain.at),
    underlyingValue: analytics.underlyingValue,
    atmStrike: analytics.atmStrike,
    atmIv: analytics.atmIv,
    pcrOi: analytics.pcrOi,
    pcrVolume: analytics.pcrVolume,
    maxPainStrike: analytics.maxPainStrike,
    oiSupport: analytics.oiSupport,
    oiResistance: analytics.oiResistance,
    totalCeOi: analytics.totalCeOi,
    totalPeOi: analytics.totalPeOi,
    strikes,
    mostTraded: mostTraded(analytics, 8),
  };
}

export async function listUnderlyings() {
  return Object.entries(UNDERLYINGS).map(([symbol, displayName]) => ({ symbol, displayName }));
}
