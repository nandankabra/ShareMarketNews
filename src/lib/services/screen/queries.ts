import "server-only";

import { analyse } from "@/lib/live/analysis";
import { liveConstituents, liveHistory } from "@/lib/live/sources";
import { matches, type ScreenCriteria, type ScreenRow } from "@/lib/screen/filters";
import { SECTOR_CATALOGUE, sectorByKey } from "@/lib/sectors/catalogue";
import type { Candle } from "@/lib/ta/types";

/**
 * How long one screen may spend reaching upstream.
 *
 * A screen wants the whole universe and cannot have it: each share costs a
 * request for its daily bars, NSE is held to a 2s gap, and a Vercel function
 * has sixty seconds. Fifty shares cold is a hundred seconds, so the scan is
 * bounded by a clock rather than a count.
 *
 * This degrades in the right direction. A cached share costs no request and
 * returns in about a millisecond, so a warm universe is screened in full while
 * a cold one is screened as far as the budget reaches — and each visit warms
 * more of it. The page reports how far it got rather than implying it saw
 * everything.
 */
const SCAN_BUDGET_MS = 32_000;

export type ScreenUniverse = { key: string; label: string; file: string };

export const SCREEN_UNIVERSES: ScreenUniverse[] = SECTOR_CATALOGUE.filter(
  (sector): sector is typeof sector & { constituentsFile: string } =>
    sector.constituentsFile != null,
).map((sector) => ({
  key: sector.key,
  label: sector.displayName,
  file: sector.constituentsFile,
}));

export type ScreenResult = {
  universe: ScreenUniverse;
  rows: ScreenRow[];
  /** How many of the universe were actually measured before the budget ran out. */
  scanned: number;
  total: number;
  /** False when the clock stopped the scan early, so the page can say so. */
  complete: boolean;
  /** False when the constituent list itself did not load. */
  available: boolean;
};

export function universeByKey(key: string): ScreenUniverse | undefined {
  return SCREEN_UNIVERSES.find((universe) => universe.key === key);
}

function toRow(symbol: string, name: string | null, bars: Candle[]): ScreenRow {
  const ta = analyse(bars);
  const close = ta.close;

  return {
    symbol,
    name,
    close,
    dayChangePercent: ta.dayChangePercent,
    rsi14: ta.rsi14,
    atrPercent: ta.atrPercent,
    // Expressed as distance rather than as the raw level: "6% off its high" is
    // the comparable number across shares priced ₹40 and ₹4,000.
    fromHighPercent:
      close != null && ta.week52High != null && ta.week52High > 0
        ? ((ta.week52High - close) / ta.week52High) * 100
        : null,
    fromLowPercent:
      close != null && ta.week52Low != null && ta.week52Low > 0
        ? ((close - ta.week52Low) / ta.week52Low) * 100
        : null,
    sma50: ta.sma50,
    sma200: ta.sma200,
    crossDirection: ta.crossDirection,
    crossAgeDays: ta.crossAgeDays,
  };
}

/**
 * Run a screen over one index's constituents.
 *
 * Sequential on purpose. Every share here is an NSE call and the per-host queue
 * serializes them anyway, so a `Promise.all` would buy nothing and would hide
 * from the deadline check how much of the budget had been spent.
 */
export async function runScreen(
  universeKey: string,
  criteria: ScreenCriteria,
): Promise<ScreenResult> {
  const universe = universeByKey(universeKey) ?? SCREEN_UNIVERSES[0];
  const constituents = await liveConstituents(universe.file);

  if (!constituents.ok) {
    return { universe, rows: [], scanned: 0, total: 0, complete: false, available: false };
  }

  const members = constituents.data;
  const deadline = Date.now() + SCAN_BUDGET_MS;
  const rows: ScreenRow[] = [];
  let scanned = 0;

  for (const member of members) {
    // Checked before the call, not after: stopping once the budget is already
    // spent is what keeps the render inside the function timeout.
    if (Date.now() > deadline) break;

    const history = await liveHistory(member.symbol);
    scanned += 1;
    if (!history.ok) continue;

    const bars: Candle[] = history.data.map((bar) => ({
      t: new Date(`${bar.day}T00:00:00.000Z`).getTime(),
      o: bar.open,
      h: bar.high,
      l: bar.low,
      c: bar.close,
      v: bar.volume,
    }));

    const row = toRow(member.symbol, member.name, bars);
    if (matches(row, criteria)) rows.push(row);
  }

  return {
    universe,
    rows: rows.sort((a, b) => a.symbol.localeCompare(b.symbol)),
    scanned,
    total: members.length,
    complete: scanned >= members.length,
    available: true,
  };
}
