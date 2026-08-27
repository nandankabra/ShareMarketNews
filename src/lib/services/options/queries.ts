import "server-only";

import type { OiBuildup } from "@/lib/db/enums";
import { inferStrikeStep } from "@/lib/options/analytics";
import { prisma } from "@/lib/prisma";

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

/**
 * The latest captured chain for an underlying.
 *
 * Everything returned here is descriptive — what is open, where it is
 * concentrated, and how it moved since the previous capture. Nothing in this
 * module produces a buy or sell instruction, and the page that renders it says
 * so on the screen.
 */
export async function getChainView(symbol: string, expiryDate?: string): Promise<ChainView | null> {
  const underlying = await prisma.optionUnderlying.findUnique({
    where: { symbol: symbol.toUpperCase() },
  });
  if (!underlying) return null;

  const expiryRows = await prisma.optionChainSnapshot.findMany({
    where: { underlyingId: underlying.id },
    distinct: ["expiryDate"],
    orderBy: { expiryDate: "asc" },
    select: { expiryDate: true },
  });
  const expiries = expiryRows.map((row) => row.expiryDate);
  if (expiries.length === 0) return null;

  const wanted = expiryDate && expiries.includes(expiryDate) ? expiryDate : expiries[0];

  const snapshot = await prisma.optionChainSnapshot.findFirst({
    where: { underlyingId: underlying.id, expiryDate: wanted },
    orderBy: { capturedAt: "desc" },
    include: { strikes: { orderBy: { strikePrice: "asc" } } },
  });
  if (!snapshot) return null;

  // Only the strikes near the money are worth a table. A hundred-and-five row
  // ladder mostly consists of contracts nobody has traded.
  const step = inferStrikeStep(snapshot.strikes);
  const span = step * 10;
  const near = snapshot.strikes.filter(
    (strike) => Math.abs(strike.strikePrice - snapshot.underlyingValue) <= span,
  );

  const traded: ChainView["mostTraded"] = [];
  for (const strike of snapshot.strikes) {
    if (strike.ceVolume) {
      traded.push({
        strikePrice: strike.strikePrice, side: "CE", volume: strike.ceVolume,
        oi: strike.ceOi, ltp: strike.ceLtp, buildup: strike.ceBuildup as OiBuildup | null,
      });
    }
    if (strike.peVolume) {
      traded.push({
        strikePrice: strike.strikePrice, side: "PE", volume: strike.peVolume,
        oi: strike.peOi, ltp: strike.peLtp, buildup: strike.peBuildup as OiBuildup | null,
      });
    }
  }
  traded.sort((a, b) => b.volume - a.volume);

  return {
    symbol: underlying.symbol,
    displayName: underlying.displayName,
    expiryDate: snapshot.expiryDate,
    expiries,
    capturedAt: snapshot.capturedAt,
    underlyingValue: snapshot.underlyingValue,
    atmStrike: snapshot.atmStrike,
    atmIv: snapshot.atmIv,
    pcrOi: snapshot.pcrOi,
    pcrVolume: snapshot.pcrVolume,
    maxPainStrike: snapshot.maxPainStrike,
    oiSupport: snapshot.oiSupport,
    oiResistance: snapshot.oiResistance,
    totalCeOi: snapshot.totalCeOi,
    totalPeOi: snapshot.totalPeOi,
    strikes: near.map((strike) => ({
      strikePrice: strike.strikePrice,
      ceOi: strike.ceOi, ceOiChange: strike.ceOiChange, ceVolume: strike.ceVolume,
      ceIv: strike.ceIv, ceLtp: strike.ceLtp, ceBuildup: strike.ceBuildup as OiBuildup | null,
      peOi: strike.peOi, peOiChange: strike.peOiChange, peVolume: strike.peVolume,
      peIv: strike.peIv, peLtp: strike.peLtp, peBuildup: strike.peBuildup as OiBuildup | null,
      isAtm: strike.strikePrice === snapshot.atmStrike,
    })),
    mostTraded: traded.slice(0, 8),
  };
}

export async function listUnderlyings() {
  return prisma.optionUnderlying.findMany({ orderBy: { symbol: "asc" }, select: { symbol: true, displayName: true } });
}
