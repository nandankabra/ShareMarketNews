import { describe, expect, it } from "vitest";

import { analyse } from "./analysis";
import type { Candle } from "@/lib/ta/types";

const DAY = 86_400_000;

/** A deterministic series: a steady climb with a fixed intrabar range. */
function series(closes: number[]): Candle[] {
  return closes.map((close, index) => ({
    t: Date.UTC(2026, 0, 1) + index * DAY,
    o: close - 1,
    h: close + 2,
    l: close - 2,
    c: close,
    v: 1_000 + index,
  }));
}

describe("analyse", () => {
  it("returns an empty analysis for no candles rather than throwing", () => {
    const result = analyse([]);
    expect(result.close).toBeNull();
    expect(result.levels).toBeNull();
    expect(result.rsi14).toBeNull();
  });

  it("reports the day change from the last two closes", () => {
    const result = analyse(series([100, 110]));
    expect(result.close).toBe(110);
    expect(result.previousClose).toBe(100);
    expect(result.dayChange).toBeCloseTo(10);
    expect(result.dayChangePercent).toBeCloseTo(10);
  });

  it("leaves long averages null until enough bars exist", () => {
    const result = analyse(series(Array.from({ length: 30 }, (_, i) => 100 + i)));
    expect(result.sma20).not.toBeNull();
    expect(result.sma50).toBeNull();
    expect(result.sma200).toBeNull();
  });

  it("takes the 52-week range from the last 250 bars, not all of history", () => {
    // An old spike that must not be reported as the 52-week high.
    const closes = [5_000, ...Array.from({ length: 300 }, () => 100)];
    const result = analyse(series(closes));
    expect(result.week52High).toBe(102);
  });

  it("skips level clustering below the minimum history", () => {
    expect(analyse(series([100, 101, 102])).levels).toBeNull();
    expect(analyse(series(Array.from({ length: 60 }, (_, i) => 100 + (i % 7)))).levels).not.toBeNull();
  });

  it("averages absolute daily moves, so direction does not cancel out", () => {
    // +10% then -9.09%: a signed mean would be ~0, an absolute one is not.
    const result = analyse(series([100, 110, 100]));
    expect(result.avgAbsChangePercent20d).toBeGreaterThan(9);
  });

  it("expresses ATR as a percentage of the latest close", () => {
    const result = analyse(series(Array.from({ length: 40 }, (_, i) => 100 + i)));
    expect(result.atr14).not.toBeNull();
    expect(result.atrPercent).toBeCloseTo((result.atr14! / result.close!) * 100);
  });
});
