import { describe, expect, it } from "vitest";

import { atrPercentRank, volatilityRegime, volatilityTrend } from "@/lib/ta/volatility";
import type { Candle } from "@/lib/ta/types";

/** A candle with a fixed intrabar range, `spread` wide, around `close`. */
function candle(t: number, close: number, spread: number): Candle {
  return { t, o: close, h: close + spread / 2, l: close - spread / 2, c: close, v: 1_000 };
}

describe("atrPercentRank", () => {
  it("returns null on a series shorter than the ATR period", () => {
    const candles = Array.from({ length: 10 }, (_, i) => candle(i, 100, 1));
    expect(atrPercentRank(candles, 14)).toBeNull();
  });

  it("ranks a calm-then-volatile series near the top", () => {
    const calm = Array.from({ length: 200 }, (_, i) => candle(i, 100, 1));
    const volatile = Array.from({ length: 20 }, (_, i) => candle(200 + i, 100, 10));
    const rank = atrPercentRank([...calm, ...volatile], 14, 252);
    expect(rank).not.toBeNull();
    expect(rank!).toBeGreaterThan(90);
  });

  it("ranks a volatile-then-calm series near the bottom", () => {
    const volatile = Array.from({ length: 200 }, (_, i) => candle(i, 100, 10));
    const calm = Array.from({ length: 20 }, (_, i) => candle(200 + i, 100, 1));
    const rank = atrPercentRank([...volatile, ...calm], 14, 252);
    expect(rank).not.toBeNull();
    expect(rank!).toBeLessThan(10);
  });
});

describe("volatilityTrend", () => {
  it("returns null when there is no room to look back", () => {
    const candles = Array.from({ length: 15 }, (_, i) => candle(i, 100, 1));
    expect(volatilityTrend(candles)).toBeNull();
  });

  it("calls a calm series that has just started swinging an expansion", () => {
    // Spreads have to vary for a percentile to mean anything: against a
    // perfectly constant history every wider bar ranks 100th, and a rank that
    // is already pinned cannot show movement.
    const calm = Array.from({ length: 200 }, (_, i) => candle(i, 100, 1 + ((i * 7) % 10) / 10));
    const widening = Array.from({ length: 10 }, (_, i) => candle(200 + i, 100, 3 + i));
    expect(volatilityTrend([...calm, ...widening])).toBe("EXPANDING");
  });

  it("calls a settling series a contraction", () => {
    const wild = Array.from({ length: 200 }, (_, i) => candle(i, 100, 6 + ((i * 7) % 10) / 2));
    const settling = Array.from({ length: 10 }, (_, i) => candle(200 + i, 100, 0.5));
    expect(volatilityTrend([...wild, ...settling])).toBe("CONTRACTING");
  });

  it("calls an unchanging series stable", () => {
    const candles = Array.from({ length: 200 }, (_, i) => candle(i, 100, 1));
    expect(volatilityTrend(candles)).toBe("STABLE");
  });
});

describe("volatilityRegime", () => {
  it("labels the extremes and leaves the middle as normal", () => {
    expect(volatilityRegime(null)).toBeNull();
    expect(volatilityRegime(80)).toBe("HIGH");
    expect(volatilityRegime(20)).toBe("LOW");
    expect(volatilityRegime(50)).toBe("NORMAL");
  });
});
