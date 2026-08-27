import type { OiBuildup } from "@/lib/db/enums";
import type { OptionChain, OptionRow, OptionSide } from "@/lib/providers/nse/parse-option-chain";

/**
 * Option-chain analytics.
 *
 * Everything here is descriptive. These are the standard readings of a chain —
 * what is open, where it is concentrated, how it moved since the last capture.
 * None of it is a recommendation, and nothing in this module produces a
 * buy or sell instruction. See docs/ARCHITECTURE.md for why that line is drawn
 * where it is.
 */

export type ChainAnalytics = {
  underlyingValue: number;
  atmStrike: number;
  atmIv: number | null;

  totalCeOi: number;
  totalPeOi: number;
  totalCeVolume: number;
  totalPeVolume: number;

  /**
   * Put-call ratio. Above 1 means more open puts than calls, conventionally
   * read as put writers expecting the level to hold. It is a crowd-position
   * measure, not a signal.
   */
  pcrOi: number;
  pcrVolume: number;

  /**
   * The strike at which option writers collectively lose least — where the
   * index would settle if writers had their way. Treated as a magnet in
   * practice; it is not a forecast and it moves as OI moves.
   */
  maxPainStrike: number;

  /** Strikes carrying the most call / put open interest. */
  oiResistance: number | null;
  oiSupport: number | null;

  rows: AnalysedRow[];
};

export type AnalysedRow = OptionRow & {
  ceBuildup: OiBuildup | null;
  peBuildup: OiBuildup | null;
  /** Distance from spot, negative below. */
  distanceFromSpot: number;
  isAtm: boolean;
};

const sum = (values: Array<number | null | undefined>): number =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0);

/**
 * Classify one side from how its price moved against its open interest. This
 * is the textbook reading:
 *   price up   + OI up   → new longs opening
 *   price down + OI up   → new shorts opening
 *   price up   + OI down → shorts buying back
 *   price down + OI down → longs closing out
 *
 * Below a threshold of movement it is FLAT — without one, rounding noise on an
 * untraded strike gets dressed up as a position change.
 */
export function classifyBuildup(side: OptionSide | null): OiBuildup | null {
  if (!side) return null;
  const { change, oiChange, oi } = side;
  if (change == null || oiChange == null) return null;

  const oiBase = oi ?? 0;
  const oiMoved = oiBase > 0 ? Math.abs(oiChange) / oiBase > 0.02 : Math.abs(oiChange) > 0;
  const priceMoved = Math.abs(change) > 0.01;

  if (!oiMoved || !priceMoved) return "FLAT";

  if (change > 0 && oiChange > 0) return "LONG_BUILDUP";
  if (change < 0 && oiChange > 0) return "SHORT_BUILDUP";
  if (change > 0 && oiChange < 0) return "SHORT_COVERING";
  return "LONG_UNWINDING";
}

/**
 * Max pain: for each candidate strike, what every open contract would be worth
 * to its holder if the index settled there. The strike with the smallest total
 * is where writers lose least.
 *
 * Calls held at strikes below settlement pay out (settle - strike); puts held
 * above settlement pay out (strike - settle).
 */
export function maxPain(rows: OptionRow[]): number {
  let best = rows[0]?.strikePrice ?? 0;
  let bestPain = Number.POSITIVE_INFINITY;

  for (const candidate of rows) {
    const settle = candidate.strikePrice;
    let pain = 0;

    for (const row of rows) {
      if (row.ce?.oi && settle > row.strikePrice) {
        pain += row.ce.oi * (settle - row.strikePrice);
      }
      if (row.pe?.oi && settle < row.strikePrice) {
        pain += row.pe.oi * (row.strikePrice - settle);
      }
    }

    if (pain < bestPain) {
      bestPain = pain;
      best = settle;
    }
  }

  return best;
}

function strikeWithMaxOi(rows: OptionRow[], pick: (row: OptionRow) => OptionSide | null): number | null {
  let best: number | null = null;
  let bestOi = 0;
  for (const row of rows) {
    const oi = pick(row)?.oi ?? 0;
    if (oi > bestOi) {
      bestOi = oi;
      best = row.strikePrice;
    }
  }
  return best;
}

export function analyseChain(chain: OptionChain): ChainAnalytics {
  const { rows, underlyingValue } = chain;

  const atmStrike = rows.reduce((closest, row) =>
    Math.abs(row.strikePrice - underlyingValue) < Math.abs(closest.strikePrice - underlyingValue)
      ? row
      : closest,
  ).strikePrice;

  const atmRow = rows.find((row) => row.strikePrice === atmStrike);
  const atmIvs = [atmRow?.ce?.iv, atmRow?.pe?.iv].filter(
    (value): value is number => typeof value === "number",
  );

  const totalCeOi = sum(rows.map((row) => row.ce?.oi));
  const totalPeOi = sum(rows.map((row) => row.pe?.oi));
  const totalCeVolume = sum(rows.map((row) => row.ce?.volume));
  const totalPeVolume = sum(rows.map((row) => row.pe?.volume));

  return {
    underlyingValue,
    atmStrike,
    atmIv: atmIvs.length ? atmIvs.reduce((a, b) => a + b, 0) / atmIvs.length : null,

    totalCeOi,
    totalPeOi,
    totalCeVolume,
    totalPeVolume,

    pcrOi: totalCeOi > 0 ? totalPeOi / totalCeOi : 0,
    pcrVolume: totalCeVolume > 0 ? totalPeVolume / totalCeVolume : 0,

    maxPainStrike: maxPain(rows),
    oiResistance: strikeWithMaxOi(rows, (row) => row.ce),
    oiSupport: strikeWithMaxOi(rows, (row) => row.pe),

    rows: rows.map((row) => ({
      ...row,
      ceBuildup: classifyBuildup(row.ce),
      peBuildup: classifyBuildup(row.pe),
      distanceFromSpot: row.strikePrice - underlyingValue,
      isAtm: row.strikePrice === atmStrike,
    })),
  };
}

/** The strikes actually worth showing: liquid, and near the money. */
export function activeStrikes(analytics: ChainAnalytics, window = 10): AnalysedRow[] {
  const step = inferStrikeStep(analytics.rows);
  const span = step * window;
  return analytics.rows.filter((row) => Math.abs(row.distanceFromSpot) <= span);
}

/** Most chains use a uniform step; take the commonest gap rather than assume. */
export function inferStrikeStep(rows: Array<{ strikePrice: number }>): number {
  const gaps = new Map<number, number>();
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i].strikePrice - rows[i - 1].strikePrice;
    if (gap > 0) gaps.set(gap, (gaps.get(gap) ?? 0) + 1);
  }
  let best = 50;
  let bestCount = 0;
  for (const [gap, count] of gaps) {
    if (count > bestCount) {
      bestCount = count;
      best = gap;
    }
  }
  return best;
}

/** Ranked by traded volume — "which contracts are actually on trade today". */
export function mostTraded(
  analytics: ChainAnalytics,
  limit = 8,
): Array<{ strikePrice: number; side: "CE" | "PE"; volume: number; oi: number | null; ltp: number | null; buildup: OiBuildup | null }> {
  const entries: Array<{ strikePrice: number; side: "CE" | "PE"; volume: number; oi: number | null; ltp: number | null; buildup: OiBuildup | null }> = [];

  for (const row of analytics.rows) {
    if (row.ce?.volume) {
      entries.push({ strikePrice: row.strikePrice, side: "CE", volume: row.ce.volume, oi: row.ce.oi, ltp: row.ce.ltp, buildup: row.ceBuildup });
    }
    if (row.pe?.volume) {
      entries.push({ strikePrice: row.strikePrice, side: "PE", volume: row.pe.volume, oi: row.pe.oi, ltp: row.pe.ltp, buildup: row.peBuildup });
    }
  }

  return entries.sort((a, b) => b.volume - a.volume).slice(0, limit);
}
