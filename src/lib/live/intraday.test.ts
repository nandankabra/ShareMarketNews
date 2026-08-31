import { describe, expect, it } from "vitest";

import { toIntradayCandles } from "./intraday";
import type { IntradayPoint } from "@/lib/providers/bse/parse-intraday";

/** 09:15:00 IST on an arbitrary day, as epoch ms. */
const OPEN = Date.UTC(2026, 7, 31, 9, 15, 0) - 5.5 * 3_600_000;

function minute(offset: number, price: number, volume: number | null = 100): IntradayPoint {
  return { at: OPEN + offset * 60_000, price, volume };
}

describe("toIntradayCandles", () => {
  it("returns nothing for an empty session", () => {
    expect(toIntradayCandles([], 5)).toEqual([]);
  });

  it("builds one candle per bucket with correct OHLC", () => {
    const points = [
      minute(0, 100), minute(1, 105), minute(2, 98), minute(3, 102), minute(4, 101),
      minute(5, 110), minute(6, 112),
    ];
    const candles = toIntradayCandles(points, 5);

    expect(candles).toHaveLength(2);
    expect(candles[0]).toMatchObject({ o: 100, h: 105, l: 98, c: 101 });
    expect(candles[1]).toMatchObject({ o: 110, h: 112, l: 110, c: 112 });
  });

  it("sums volume across the bucket", () => {
    const candles = toIntradayCandles([minute(0, 100, 10), minute(1, 101, 20), minute(2, 102, 30)], 5);
    expect(candles[0].v).toBe(60);
  });

  it("reports null volume when the upstream gave none", () => {
    const candles = toIntradayCandles([minute(0, 100, null), minute(1, 101, null)], 5);
    expect(candles[0].v).toBeNull();
  });

  it("aligns buckets to the clock, not to the first data point", () => {
    // A session whose first tick lands at 09:17 must still bucket 09:15–09:20.
    const candles = toIntradayCandles([minute(2, 100), minute(3, 101), minute(6, 105)], 5);
    expect(candles[0].t).toBe(OPEN);
    expect(candles[1].t).toBe(OPEN + 5 * 60_000);
  });

  it("groups the same points differently at a coarser interval", () => {
    const points = Array.from({ length: 30 }, (_, i) => minute(i, 100 + i));
    expect(toIntradayCandles(points, 5)).toHaveLength(6);
    expect(toIntradayCandles(points, 15)).toHaveLength(2);
  });

  it("leaves a short first candle when the session does not start on the boundary", () => {
    // The Indian session opens at 09:15, which is not a multiple of 30 or 60
    // minutes. Buckets stay aligned to the clock, so the first half-hourly
    // candle covers 09:15-09:30 and is a stub. That is what a broker's chart
    // shows too; the alternative — aligning buckets to the open — puts every
    // candle at :15 and :45 and disagrees with every other chart.
    const points = Array.from({ length: 30 }, (_, i) => minute(i, 100 + i));
    const half = toIntradayCandles(points, 30);

    expect(half).toHaveLength(2);
    expect(half[0].t).toBe(OPEN - 15 * 60_000); // the 09:00 bucket
    expect(half[1].t).toBe(OPEN + 15 * 60_000); // 09:30
  });

  it("carries the session low and high into the right candles", () => {
    const points = [minute(0, 100), minute(1, 90), minute(5, 100), minute(6, 130)];
    const candles = toIntradayCandles(points, 5);
    expect(candles[0].l).toBe(90);
    expect(candles[1].h).toBe(130);
  });
});
