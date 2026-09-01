import { describe, expect, it } from "vitest";

import { atrPercentRank, volatilityRegime } from "@/lib/ta/volatility";
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

describe("volatilityRegime", () => {
  it("labels the extremes and leaves the middle as normal", () => {
    expect(volatilityRegime(null)).toBeNull();
    expect(volatilityRegime(80)).toBe("HIGH");
    expect(volatilityRegime(20)).toBe("LOW");
    expect(volatilityRegime(50)).toBe("NORMAL");
  });
});
