import { describe, expect, it } from "vitest";

import type { Candle } from "@/lib/ta/types";
import { sessionVwap, vwapSeries } from "@/lib/ta/vwap";

/** A flat bar at `price` — typical price is the price itself. */
function bar(t: number, price: number, volume: number | null): Candle {
  return { t, o: price, h: price, l: price, c: price, v: volume };
}

describe("vwapSeries", () => {
  it("weights by volume, not by bar count", () => {
    // 100 on one share, 200 on nine: the average price is 100 and the volume
    // weighted one is 190.
    const series = vwapSeries([bar(1, 100, 1), bar(2, 200, 9)]);
    expect(series[1]).toBeCloseTo(190, 6);
  });

  it("uses the typical price rather than the close alone", () => {
    const candle: Candle = { t: 1, o: 100, h: 120, l: 90, c: 100, v: 10 };
    expect(vwapSeries([candle])[0]).toBeCloseTo((120 + 90 + 100) / 3, 6);
  });

  it("accumulates from the first bar rather than resetting", () => {
    const series = vwapSeries([bar(1, 100, 10), bar(2, 100, 10), bar(3, 400, 20)]);
    expect(series[0]).toBeCloseTo(100, 6);
    expect(series[1]).toBeCloseTo(100, 6);
    expect(series[2]).toBeCloseTo(250, 6);
  });

  it("ignores bars with no volume instead of counting them as zero", () => {
    const withNull = vwapSeries([bar(1, 100, 10), bar(2, 500, null)]);
    expect(withNull[1]).toBeCloseTo(100, 6);
  });

  it("stays null until some volume has arrived", () => {
    expect(vwapSeries([bar(1, 100, null), bar(2, 100, 0)])).toEqual([null, null]);
  });
});

describe("sessionVwap", () => {
  it("is the running value at the last bar", () => {
    expect(sessionVwap([bar(1, 100, 1), bar(2, 200, 1)])).toBeCloseTo(150, 6);
  });

  it("is null for a session that has not traded", () => {
    expect(sessionVwap([])).toBeNull();
    expect(sessionVwap([bar(1, 100, null)])).toBeNull();
  });
});
