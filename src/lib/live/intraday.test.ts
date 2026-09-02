import { describe, expect, it } from "vitest";

import { applyLivePrice, toIntradayCandles, INTRADAY_INTERVALS } from "./intraday";
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

describe("folding the same session at several intervals", () => {
  // A full session's worth of minutes with a shape to them, so extremes land
  // inside buckets rather than on their edges.
  const points = Array.from({ length: 375 }, (_, i) =>
    minute(i, 100 + Math.sin(i / 7) * 5 + i * 0.01, 10 + (i % 5)),
  );

  it("keeps every interval a view of the same session", () => {
    const totalVolume = points.reduce((sum, point) => sum + (point.volume ?? 0), 0);

    for (const minutes of INTRADAY_INTERVALS) {
      const candles = toIntradayCandles(points, minutes);
      expect(candles.length).toBeGreaterThan(0);
      // Same first open, same last close, same volume — only the grouping differs.
      expect(candles[0].o).toBe(points[0].price);
      expect(candles.at(-1)!.c).toBe(points.at(-1)!.price);
      expect(candles.reduce((sum, candle) => sum + (candle.v ?? 0), 0)).toBe(totalVolume);
    }
  });

  it("nests coarser bars over finer ones", () => {
    const fine = toIntradayCandles(points, 5);
    const coarse = toIntradayCandles(points, 15);

    for (const bar of coarse) {
      const inside = fine.filter((candle) => candle.t >= bar.t && candle.t < bar.t + 15 * 60_000);
      expect(inside.length).toBeGreaterThan(0);
      expect(bar.h).toBe(Math.max(...inside.map((candle) => candle.h)));
      expect(bar.l).toBe(Math.min(...inside.map((candle) => candle.l)));
      expect(bar.o).toBe(inside[0].o);
      expect(bar.c).toBe(inside.at(-1)!.c);
    }
  });

  it("gives more bars the finer the interval", () => {
    const counts = INTRADAY_INTERVALS.map((minutes) => toIntradayCandles(points, minutes).length);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });

  it("makes a settled one-minute bar a single print, with no body", () => {
    const candles = toIntradayCandles(points, 1);
    expect(candles).toHaveLength(points.length);
    // One price a minute is all the upstream publishes, so O=H=L=C until the
    // live price is folded into the bar still forming.
    expect(candles.every((candle) => candle.o === candle.c && candle.h === candle.l)).toBe(true);

    const withLive = applyLivePrice(candles, candles.at(-1)!.c + 3, points.at(-1)!.at, 1);
    expect(withLive.at(-1)!.h).toBeGreaterThan(withLive.at(-1)!.l);
  });
});

describe("applyLivePrice", () => {
  const bars = () => toIntradayCandles([minute(0, 100), minute(1, 104), minute(2, 102)], 5);

  it("stretches the forming candle to admit a higher price", () => {
    const out = applyLivePrice(bars(), 107, OPEN + 3 * 60_000, 5);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ o: 100, h: 107, l: 100, c: 107 });
  });

  it("stretches it downward too", () => {
    const out = applyLivePrice(bars(), 95, OPEN + 3 * 60_000, 5);
    expect(out[0]).toMatchObject({ h: 104, l: 95, c: 95 });
  });

  it("moves the close without widening when the price is inside the range", () => {
    const out = applyLivePrice(bars(), 101, OPEN + 3 * 60_000, 5);
    expect(out[0]).toMatchObject({ o: 100, h: 104, l: 100, c: 101 });
  });

  it("opens a new candle when the price belongs to a later bucket", () => {
    const out = applyLivePrice(bars(), 110, OPEN + 6 * 60_000, 5);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ o: 110, h: 110, l: 110, c: 110, v: null });
    // The finished candle must not be altered by a price outside it.
    expect(out[0]).toMatchObject({ h: 104, l: 100, c: 102 });
  });

  it("ignores a price older than the forming candle", () => {
    const out = applyLivePrice(bars(), 999, OPEN - 10 * 60_000, 5);
    expect(out).toEqual(bars());
  });

  it("ignores absent or nonsensical prices rather than drawing them", () => {
    expect(applyLivePrice(bars(), null, OPEN + 3 * 60_000, 5)).toEqual(bars());
    expect(applyLivePrice(bars(), 0, OPEN + 3 * 60_000, 5)).toEqual(bars());
  });

  it("starts a series from the live price when there are no bars yet", () => {
    const out = applyLivePrice([], 250, OPEN, 5);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ t: OPEN, o: 250, c: 250 });
  });
});
