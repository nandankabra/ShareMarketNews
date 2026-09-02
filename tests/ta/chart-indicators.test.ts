import { describe, expect, it } from "vitest";

import { connorsRsi, percentRankOfReturns, streaks } from "@/lib/ta/connors-rsi";
import { toHeikinAshi } from "@/lib/ta/heikin-ashi";
import { pivotLevels, pivotsFromPrevious } from "@/lib/ta/pivot-points";
import type { Candle } from "@/lib/ta/types";

function candle(t: number, o: number, h: number, l: number, c: number): Candle {
  return { t, o, h, l, c, v: 1_000 };
}

describe("toHeikinAshi", () => {
  it("closes at the average of the real bar's own four prices", () => {
    const [bar] = toHeikinAshi([candle(1, 100, 110, 90, 104)]);
    expect(bar.c).toBeCloseTo((100 + 110 + 90 + 104) / 4, 10);
  });

  it("opens the first bar at the real bar's midpoint, having nothing before it", () => {
    const [bar] = toHeikinAshi([candle(1, 100, 110, 90, 104)]);
    expect(bar.o).toBeCloseTo((100 + 104) / 2, 10);
  });

  it("opens every later bar at the midpoint of the previous derived bar", () => {
    const bars = toHeikinAshi([candle(1, 100, 110, 90, 104), candle(2, 104, 118, 102, 116)]);
    expect(bars[1].o).toBeCloseTo((bars[0].o + bars[0].c) / 2, 10);
  });

  it("stretches high and low to contain the derived body", () => {
    const bars = toHeikinAshi([candle(1, 100, 110, 90, 104), candle(2, 104, 118, 102, 116)]);
    for (const bar of bars) {
      expect(bar.h).toBeGreaterThanOrEqual(Math.max(bar.o, bar.c));
      expect(bar.l).toBeLessThanOrEqual(Math.min(bar.o, bar.c));
    }
  });

  it("carries time and volume through untouched", () => {
    const source = [candle(1, 100, 110, 90, 104), candle(2, 104, 118, 102, 116)];
    const bars = toHeikinAshi(source);
    expect(bars.map((bar) => bar.t)).toEqual([1, 2]);
    expect(bars.map((bar) => bar.v)).toEqual([1_000, 1_000]);
  });

  it("returns nothing for nothing", () => {
    expect(toHeikinAshi([])).toEqual([]);
  });
});

describe("pivotLevels", () => {
  // H 110, L 90, C 100 -> P = 100, and every level falls out by hand.
  const levels = pivotLevels(110, 90, 100);

  it("puts the pivot at the average of high, low and close", () => {
    expect(levels.p).toBeCloseTo(100, 10);
  });

  it("matches the traditional formulas", () => {
    expect(levels.r[0]).toBeCloseTo(110, 10); // 2P - L
    expect(levels.s[0]).toBeCloseTo(90, 10); //  2P - H
    expect(levels.r[1]).toBeCloseTo(120, 10); // P + (H - L)
    expect(levels.s[1]).toBeCloseTo(80, 10); //  P - (H - L)
    expect(levels.r[2]).toBeCloseTo(130, 10); // 2P + (H - 2L)
    expect(levels.s[2]).toBeCloseTo(70, 10); //  2P - (2H - L)
    expect(levels.r[3]).toBeCloseTo(140, 10);
    expect(levels.s[3]).toBeCloseTo(60, 10);
    expect(levels.r[4]).toBeCloseTo(150, 10);
    expect(levels.s[4]).toBeCloseTo(50, 10);
  });

  it("keeps resistances above the pivot and supports below, in order", () => {
    const skewed = pivotLevels(124, 91, 117);
    expect(skewed.r.every((value, i) => i === 0 || value > skewed.r[i - 1])).toBe(true);
    expect(skewed.s.every((value, i) => i === 0 || value < skewed.s[i - 1])).toBe(true);
    expect(skewed.r[0]).toBeGreaterThan(skewed.p);
    expect(skewed.s[0]).toBeLessThan(skewed.p);
  });
});

describe("pivotsFromPrevious", () => {
  it("uses the last finished period, not the one in progress", () => {
    const periods = [candle(1, 90, 110, 90, 100), candle(2, 100, 200, 50, 150)];
    // The second period is still forming, so the levels must come from the first.
    expect(pivotsFromPrevious(periods)?.p).toBeCloseTo(100, 10);
  });

  it("has nothing to say with only one period", () => {
    expect(pivotsFromPrevious([candle(1, 90, 110, 90, 100)])).toBeNull();
    expect(pivotsFromPrevious([])).toBeNull();
  });
});

describe("streaks", () => {
  it("counts consecutive rises up and falls down", () => {
    expect(streaks([10, 11, 12, 13, 12, 11, 11, 12])).toEqual([0, 1, 2, 3, -1, -2, 0, 1]);
  });
});

describe("percentRankOfReturns", () => {
  it("ranks the strongest move in the window at the top", () => {
    // Four small rises then a jump: the jump beats every return before it.
    const closes = [100, 101, 102, 103, 104, 130];
    const ranked = percentRankOfReturns(closes, 4);
    expect(ranked.at(-1)).toBe(100);
  });

  it("ranks the weakest move in the window at the bottom", () => {
    const closes = [100, 101, 102, 103, 104, 80];
    expect(percentRankOfReturns(closes, 4).at(-1)).toBe(0);
  });

  it("stays null until the window has filled", () => {
    expect(percentRankOfReturns([100, 101, 102], 50).every((value) => value == null)).toBe(true);
  });
});

describe("connorsRsi", () => {
  const rising = Array.from({ length: 60 }, (_, i) => 100 * 1.004 ** i);

  it("stays inside 0-100", () => {
    for (const value of connorsRsi(rising, 3, 2, 20)) {
      if (value == null) continue;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it("runs hot on an unbroken climb", () => {
    const value = connorsRsi(rising, 3, 2, 20).at(-1);
    expect(value).not.toBeNull();
    expect(value!).toBeGreaterThan(65);
  });

  it("runs cold on an unbroken slide", () => {
    const falling = Array.from({ length: 60 }, (_, i) => 100 * 0.996 ** i);
    const value = connorsRsi(falling, 3, 2, 20).at(-1);
    expect(value!).toBeLessThan(35);
  });

  it("says nothing until all three components have filled", () => {
    // The rank period is the slowest of the three, so it sets the start.
    const values = connorsRsi(rising, 3, 2, 50);
    expect(values[10]).toBeNull();
    expect(values.at(-1)).not.toBeNull();
  });
});
