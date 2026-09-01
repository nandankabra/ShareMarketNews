import { describe, expect, it } from "vitest";

import { analyseRegime } from "./regime";
import type { Candle } from "@/lib/ta/types";

const DAY = 86_400_000;

/** Weekdays only, so the ISO-week grouping in `toWeekly` behaves like a real calendar. */
function series(closes: number[]): Candle[] {
  const out: Candle[] = [];
  let t = Date.UTC(2026, 0, 5); // a Monday
  for (const close of closes) {
    const day = new Date(t).getUTCDay();
    if (day === 0 || day === 6) t += DAY;
    out.push({ t, o: close - 1, h: close + 2, l: close - 2, c: close, v: 1_000 });
    t += DAY;
  }
  return out;
}

describe("analyseRegime", () => {
  it("returns no confluence rather than guessing on thin history", () => {
    const result = analyseRegime(series(Array.from({ length: 30 }, (_, i) => 100 + i)));
    expect(result.confluence).toBeNull();
  });

  it("reports aligned-up confluence on a steady multi-month climb", () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 + i * 0.5);
    const result = analyseRegime(series(closes));
    expect(result.confluence).not.toBeNull();
    expect(result.confluence!.daily).toBe("UP");
    expect(result.confluence!.weekly).toBe("UP");
    expect(result.confluence!.aligned).toBe(true);
  });

  it("reports aligned-down confluence on a steady multi-month decline", () => {
    const closes = Array.from({ length: 300 }, (_, i) => 500 - i * 0.5);
    const result = analyseRegime(series(closes));
    expect(result.confluence).not.toBeNull();
    expect(result.confluence!.daily).toBe("DOWN");
    expect(result.confluence!.weekly).toBe("DOWN");
    expect(result.confluence!.aligned).toBe(true);
  });

  it("is not aligned when the close sits flat against its trailing average", () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 + (i % 2 === 0 ? 0.1 : -0.1));
    const result = analyseRegime(series(closes));
    expect(result.confluence).not.toBeNull();
    expect(result.confluence!.aligned).toBe(false);
  });

  it("carries a volatility regime once there is enough history for ATR", () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 10) * 5);
    const result = analyseRegime(series(closes));
    expect(result.volatility.atrPercentRank).not.toBeNull();
    expect(result.volatility.regime).not.toBeNull();
  });

  it("leaves volatility null on too short a series", () => {
    const result = analyseRegime(series([100, 101, 102]));
    expect(result.volatility.atrPercentRank).toBeNull();
    expect(result.volatility.regime).toBeNull();
  });
});
