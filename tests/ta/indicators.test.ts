import { describe, expect, it } from "vitest";

import { atr, trueRange } from "@/lib/ta/atr";
import { bollinger } from "@/lib/ta/bollinger";
import { computeLevels, nearestRound } from "@/lib/ta/levels";
import { macd } from "@/lib/ta/macd";
import { ema, last, sma } from "@/lib/ta/moving-average";
import { findPivots } from "@/lib/ta/pivots";
import { rsi } from "@/lib/ta/rsi";
import type { Candle } from "@/lib/ta/types";

/**
 * Wilder's own worked RSI example from New Concepts in Technical Trading
 * Systems. Any implementation that disagrees with this series is using a plain
 * average instead of Wilder smoothing — the classic silent wrong answer, since
 * the output still looks entirely plausible.
 */
const WILDER_CLOSES = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
  46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35,
  44.03, 44.18, 44.22, 44.57, 43.42, 42.66, 43.13,
];

function candlesFrom(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    t: i * 86_400_000,
    o: close,
    h: close * 1.005,
    l: close * 0.995,
    c: close,
    v: 1_000_000,
  }));
}

describe("sma", () => {
  it("is null until the window fills, then averages it", () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(out).toEqual([null, null, 2, 3, 4]);
  });
});

describe("ema", () => {
  it("seeds from the SMA of the first period, not from the first value", () => {
    // Seeding at values[0] leaves a visible distortion across the first ~50
    // bars and puts the overlay visibly off every broker chart.
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(2, 10);
    expect(out[3]).toBeCloseTo(3, 10);
  });
});

describe("rsi", () => {
  it("matches Wilder's method, hand-derived", () => {
    // Derived from first principles rather than copied from a table, because
    // published versions of this series disagree in the last decimal depending
    // on how they seed.
    //   changes 1..14 → gains sum 3.34, losses sum 1.40
    //   avgGain 3.34/14 = 0.238571, avgLoss 1.40/14 = 0.100000
    //   RS 2.385714 → RSI 100 - 100/3.385714 = 70.46
    // then carried forward with (prev * 13 + current) / 14.
    const out = rsi(WILDER_CLOSES, 14);
    expect(out[14]).toBeCloseTo(70.46, 2);
    expect(out[15]).toBeCloseTo(66.25, 2);
    expect(out[16]).toBeCloseTo(66.48, 2);
  });

  it("is null until the period fills", () => {
    const out = rsi(WILDER_CLOSES, 14);
    expect(out.slice(0, 14).every((value) => value === null)).toBe(true);
  });

  it("returns all nulls rather than throwing on a short series", () => {
    expect(rsi([1, 2, 3], 14).every((value) => value === null)).toBe(true);
  });

  it("pins at 100 when nothing has fallen", () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(last(rsi(rising, 14))).toBe(100);
  });
});

describe("atr", () => {
  it("takes the widest of range and the two gaps", () => {
    const previous: Candle = { t: 0, o: 10, h: 11, l: 9, c: 10, v: null };
    const current: Candle = { t: 1, o: 15, h: 16, l: 14, c: 15, v: null };
    // The gap from yesterday's close (16 - 10 = 6) beats today's span of 2.
    expect(trueRange(current, previous)).toBe(6);
  });

  it("uses the full range when there is no previous bar", () => {
    expect(trueRange({ t: 0, o: 10, h: 12, l: 9, c: 11, v: null }, undefined)).toBe(3);
  });

  it("fills from the period onward", () => {
    const out = atr(candlesFrom(WILDER_CLOSES), 14);
    expect(out[13]).toBeNull();
    expect(out[14]).toBeGreaterThan(0);
  });
});

describe("macd", () => {
  it("aligns the signal to the macd line rather than to padded nulls", () => {
    // Running the signal EMA over an array whose leading nulls were coerced to
    // zero drags the first values toward zero — the usual bug here.
    const closes = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const out = macd(closes);

    const firstMacd = out.macd.findIndex((value) => value != null);
    const firstSignal = out.signal.findIndex((value) => value != null);
    expect(firstMacd).toBe(25);
    expect(firstSignal).toBe(firstMacd + 8);

    for (let i = firstSignal; i < closes.length; i++) {
      expect(out.histogram[i]).toBeCloseTo(out.macd[i]! - out.signal[i]!, 10);
    }
  });
});

describe("bollinger", () => {
  it("normalises bandwidth by the middle band", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + (i % 4));
    const out = bollinger(closes, 20, 2);
    expect(out.middle[19]).not.toBeNull();
    expect(out.upper[19]!).toBeGreaterThan(out.lower[19]!);
    expect(out.bandwidth[19]!).toBeGreaterThan(0);
  });

  it("is flat-banded on a constant series", () => {
    const out = bollinger(new Array(30).fill(50), 20, 2);
    expect(out.upper[25]).toBeCloseTo(50, 10);
    expect(out.bandwidth[25]).toBeCloseTo(0, 10);
  });
});

describe("pivots and levels", () => {
  const zigzag: Candle[] = [];
  for (let i = 0; i < 120; i++) {
    const base = 1000 + Math.sin(i / 6) * 40;
    zigzag.push({ t: i * 86_400_000, o: base, h: base + 6, l: base - 6, c: base, v: 500_000 });
  }

  it("finds swing highs and lows", () => {
    const pivots = findPivots(zigzag, 2);
    expect(pivots.some((pivot) => pivot.kind === "HIGH")).toBe(true);
    expect(pivots.some((pivot) => pivot.kind === "LOW")).toBe(true);
  });

  it("splits levels either side of spot and measures distance in ATR", () => {
    const levels = computeLevels(zigzag);
    expect(levels.supports.every((level) => level.price < levels.spot)).toBe(true);
    expect(levels.resistances.every((level) => level.price >= levels.spot)).toBe(true);
    for (const level of [...levels.supports, ...levels.resistances]) {
      expect(level.distanceAtr).not.toBeNull();
      expect(level.distanceAtr!).toBeGreaterThanOrEqual(0);
    }
  });

  it("always carries the year's extremes as anchors", () => {
    const levels = computeLevels(zigzag);
    const kinds = [...levels.supports, ...levels.resistances].map((level) => level.kind);
    expect(kinds).toContain("YEAR_HIGH");
    expect(kinds).toContain("YEAR_LOW");
  });

  it("returns an empty set rather than inventing levels on a short series", () => {
    const levels = computeLevels(zigzag.slice(0, 8));
    expect(levels.supports).toHaveLength(0);
    expect(levels.resistances).toHaveLength(0);
  });

  it("scales the round number to the price", () => {
    // A ₹60 small-cap and an ₹8,000 large-cap need different round numbers.
    expect(nearestRound(61.4)).toBe(60);
    expect(nearestRound(3142)).toBe(3100);
    expect(nearestRound(24207)).toBe(24000);
  });
});
