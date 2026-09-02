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

  it("reports a fully aligned climb across all three timeframes", () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 + i * 0.5);
    const confluence = analyseRegime(series(closes)).confluence;
    expect(confluence).not.toBeNull();
    expect(confluence!.timeframes.map((timeframe) => timeframe.label)).toEqual(["daily", "weekly", "monthly"]);
    expect(confluence!.alignment).toBe("FULL");
    expect(confluence!.direction).toBe("UP");
    expect(confluence!.score).toBe(100);
  });

  it("reports a fully aligned decline the same way, signed the other direction", () => {
    const closes = Array.from({ length: 300 }, (_, i) => 500 - i * 0.5);
    const confluence = analyseRegime(series(closes)).confluence;
    expect(confluence!.alignment).toBe("FULL");
    expect(confluence!.direction).toBe("DOWN");
    expect(confluence!.score).toBe(-100);
  });

  it("still reads all three timeframes off the seventy bars NSE actually returns", () => {
    const closes = Array.from({ length: 70 }, (_, i) => 100 + i * 0.5);
    const confluence = analyseRegime(series(closes)).confluence;
    expect(confluence).not.toBeNull();
    expect(confluence!.timeframes.map((timeframe) => timeframe.label)).toEqual(["daily", "weekly", "monthly"]);
    expect(confluence!.timeframes.every((timeframe) => timeframe.distancePercent != null)).toBe(true);
  });

  it("calls a series that goes nowhere untrending rather than aligned", () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 + (i % 2 === 0 ? 0.1 : -0.1));
    const confluence = analyseRegime(series(closes)).confluence;
    expect(confluence!.alignment).toBe("NONE");
    expect(confluence!.score).toBe(0);
  });

  it("carries a volatility regime and its direction once there is enough history", () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 10) * 5);
    const result = analyseRegime(series(closes));
    expect(result.volatility.atrPercentRank).not.toBeNull();
    expect(result.volatility.regime).not.toBeNull();
    expect(result.volatility.trend).not.toBeNull();
  });

  it("leaves volatility null on too short a series", () => {
    const result = analyseRegime(series([100, 101, 102]));
    expect(result.volatility.atrPercentRank).toBeNull();
    expect(result.volatility.regime).toBeNull();
    expect(result.volatility.trend).toBeNull();
  });
});
