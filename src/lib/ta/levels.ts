import { atr } from "./atr";
import { findPivots, type Pivot } from "./pivots";
import type { Candle } from "./types";

export type LevelKind = "PIVOT" | "YEAR_HIGH" | "YEAR_LOW" | "ROUND";

export type Level = {
  price: number;
  kind: LevelKind;
  /** How many swing pivots formed this level. */
  touches: number;
  /** Touches weighted by recency and by volume; the ranking key. */
  strength: number;
  /** Index of the most recent touch, for "last tested" copy. */
  lastTouchIndex: number;
  side: "SUPPORT" | "RESISTANCE";
  /** Signed distance from spot as a percentage. */
  distancePercent: number;
  /** Absolute distance from spot in ATR multiples. */
  distanceAtr: number | null;
};

export type LevelSet = {
  spot: number;
  atr: number | null;
  supports: Level[];
  resistances: Level[];
  computedAt: string;
};

/**
 * Cluster pivots into levels and rank them.
 *
 * The tolerance is ATR-relative rather than a fixed rupee window, which is the
 * one decision here that actually matters. A ₹30 band is meaningless on a ₹60
 * small-cap and invisible on an ₹8,000 large-cap; 0.75 × ATR is proportionate
 * to how much the share actually moves, so the same code produces sensible
 * clusters for both.
 *
 * Strength weights each touch by recency and by the volume traded when it
 * formed: a level tested last month with heavy volume should outrank one from
 * eleven months ago on a quiet day, even though both are "one touch".
 */
export function computeLevels(
  candles: Candle[],
  options: { spot?: number; atrPeriod?: number; maxPerSide?: number } = {},
): LevelSet {
  const maxPerSide = options.maxPerSide ?? 3;
  const spot = options.spot ?? candles.at(-1)?.c ?? 0;

  const atrSeries = atr(candles, options.atrPeriod ?? 14);
  const atrValue = [...atrSeries].reverse().find((value) => value != null) ?? null;

  const empty: LevelSet = {
    spot,
    atr: atrValue,
    supports: [],
    resistances: [],
    computedAt: new Date().toISOString(),
  };
  if (candles.length < 20 || spot <= 0) return empty;

  // Fall back to a percentage band when ATR has not filled yet — a young
  // listing still deserves levels, just less precise ones.
  const tolerance = atrValue != null ? atrValue * 0.75 : spot * 0.01;

  const pivots = findPivots(candles);
  if (pivots.length === 0) return empty;

  const newestIndex = candles.length - 1;
  const medianVolume = median(candles.map((c) => c.v ?? 0).filter((v) => v > 0)) || 1;

  type Cluster = { prices: number[]; weight: number; touches: number; lastTouchIndex: number };
  const clusters: Cluster[] = [];

  // Newest first, so a cluster's representative price leans recent.
  for (const pivot of [...pivots].sort((a, b) => b.index - a.index)) {
    const existing = clusters.find(
      (cluster) => Math.abs(mean(cluster.prices) - pivot.price) <= tolerance,
    );

    const weight = touchWeight(pivot, newestIndex, candles.length, medianVolume);

    if (existing) {
      existing.prices.push(pivot.price);
      existing.weight += weight;
      existing.touches += 1;
      existing.lastTouchIndex = Math.max(existing.lastTouchIndex, pivot.index);
    } else {
      clusters.push({
        prices: [pivot.price],
        weight,
        touches: 1,
        lastTouchIndex: pivot.index,
      });
    }
  }

  const levels: Level[] = clusters.map((cluster) => {
    const price = mean(cluster.prices);
    return buildLevel(price, "PIVOT", cluster.touches, cluster.weight, cluster.lastTouchIndex, spot, atrValue);
  });

  // Anchors: the year's extremes and the nearest round number always belong on
  // the chart, whether or not a swing happened to form there.
  const yearHigh = Math.max(...candles.map((c) => c.h));
  const yearLow = Math.min(...candles.map((c) => c.l));
  levels.push(buildLevel(yearHigh, "YEAR_HIGH", 1, 0.6, newestIndex, spot, atrValue));
  levels.push(buildLevel(yearLow, "YEAR_LOW", 1, 0.6, newestIndex, spot, atrValue));

  const round = nearestRound(spot);
  if (round !== null) {
    levels.push(buildLevel(round, "ROUND", 1, 0.3, newestIndex, spot, atrValue));
  }

  const dedup = dedupeByPrice(levels, tolerance);

  return {
    spot,
    atr: atrValue,
    supports: dedup
      .filter((level) => level.side === "SUPPORT")
      .sort((a, b) => b.strength - a.strength)
      .slice(0, maxPerSide + 1)
      .sort((a, b) => b.price - a.price),
    resistances: dedup
      .filter((level) => level.side === "RESISTANCE")
      .sort((a, b) => b.strength - a.strength)
      .slice(0, maxPerSide + 1)
      .sort((a, b) => a.price - b.price),
    computedAt: new Date().toISOString(),
  };
}

function touchWeight(pivot: Pivot, newestIndex: number, span: number, medianVolume: number): number {
  // Linear recency: the newest bar counts 1, the oldest counts 0.2.
  const age = (newestIndex - pivot.index) / Math.max(span, 1);
  const recency = 1 - age * 0.8;
  // Volume conviction, capped so one enormous day cannot invent a level.
  const volume = pivot.volume ? Math.min(pivot.volume / medianVolume, 3) : 1;
  return recency * (0.6 + 0.4 * volume);
}

function buildLevel(
  price: number,
  kind: LevelKind,
  touches: number,
  strength: number,
  lastTouchIndex: number,
  spot: number,
  atrValue: number | null,
): Level {
  return {
    price,
    kind,
    touches,
    strength,
    lastTouchIndex,
    side: price >= spot ? "RESISTANCE" : "SUPPORT",
    distancePercent: ((price - spot) / spot) * 100,
    distanceAtr: atrValue && atrValue > 0 ? Math.abs(price - spot) / atrValue : null,
  };
}

/**
 * Two levels a hair apart are one level.
 *
 * Merging rather than dropping matters: when a swing cluster sits exactly at
 * the year high, that IS the year high, and dropping the weaker-scored anchor
 * loses the more informative label. So the stronger level survives but adopts
 * the anchor's kind, keeping both its touch count and the better name.
 */
function dedupeByPrice(levels: Level[], tolerance: number): Level[] {
  const sorted = [...levels].sort((a, b) => b.strength - a.strength);
  const kept: Level[] = [];

  for (const level of sorted) {
    const collision = kept.find((other) => Math.abs(other.price - level.price) <= tolerance * 0.5);

    if (!collision) {
      kept.push(level);
      continue;
    }

    // Anchors carry the more useful label; pivots carry the touch count.
    if (collision.kind === "PIVOT" && level.kind !== "PIVOT") {
      collision.kind = level.kind;
    } else if (level.kind === "PIVOT" && collision.kind !== "PIVOT") {
      collision.touches = Math.max(collision.touches, level.touches);
    }
  }

  return kept;
}

/**
 * The round number traders actually watch, scaled to the price.
 *
 * A single formula does not work across this range. Deriving the step from the
 * order of magnitude gives 25,000 for a Nifty at 24,207 — nobody watches that;
 * they watch 24,000 and 24,500. The explicit ladder below is less clever and
 * considerably more correct.
 */
export function nearestRound(spot: number): number | null {
  if (spot <= 0) return null;

  const step = spot < 100 ? 5 : spot < 1_000 ? 50 : spot < 10_000 ? 100 : 500;
  const candidate = Math.round(spot / step) * step;

  // A "round number" the price is already sitting on is not a level.
  if (candidate === 0) return null;
  return Math.abs(candidate - spot) / spot < 0.15 ? candidate : null;
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
