import { describe, expect, it } from "vitest";

import { parseBseIntraday } from "./parse-intraday";

function envelope(points: Array<{ dttm: string; vale1: string; vole?: string }>, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    CurrDate: "Mon Aug 31 2026 13:20:31",
    CurrTime: "13:20",
    CurrVal: "184.00",
    PrevClose: "185.85",
    HighVal: "186",
    LowVal: "180",
    ...extra,
    Data: JSON.stringify(points),
  });
}

describe("parseBseIntraday", () => {
  it("reads the session's real high and low from the series, not the axis fields", () => {
    // Taken from LOTUSDEV mid-session: the upstream reported 186/180 as its
    // chart bounds while the series itself ranged 185.65 to 180.15. Trusting
    // the fields put a range on screen that never traded.
    const series = parseBseIntraday(
      envelope([
        { dttm: "Mon Aug 31 2026 09:15:25", vale1: "185.65" },
        { dttm: "Mon Aug 31 2026 09:16:25", vale1: "180.15" },
        { dttm: "Mon Aug 31 2026 09:17:25", vale1: "184.00" },
      ]),
      "544469",
    );

    expect(series.dayHigh).toBe(185.65);
    expect(series.dayLow).toBe(180.15);
    expect(series.axisHigh).toBe(186);
    expect(series.axisLow).toBe(180);
  });

  it("reads timestamps as IST rather than as the server's timezone", () => {
    const series = parseBseIntraday(
      envelope([{ dttm: "Mon Aug 31 2026 09:15:00", vale1: "100" }]),
      "1",
    );
    // 09:15 IST is 03:45 UTC on the same day.
    expect(new Date(series.points[0].at).toISOString()).toBe("2026-08-31T03:45:00.000Z");
  });

  it("drops zero-priced minutes rather than plotting a spike to the axis", () => {
    const series = parseBseIntraday(
      envelope([
        { dttm: "Mon Aug 31 2026 09:15:00", vale1: "100" },
        { dttm: "Mon Aug 31 2026 09:16:00", vale1: "0" },
        { dttm: "Mon Aug 31 2026 09:17:00", vale1: "102" },
      ]),
      "1",
    );
    expect(series.points).toHaveLength(2);
    expect(series.dayLow).toBe(100);
  });

  it("sorts points chronologically even if the upstream does not", () => {
    const series = parseBseIntraday(
      envelope([
        { dttm: "Mon Aug 31 2026 09:17:00", vale1: "102" },
        { dttm: "Mon Aug 31 2026 09:15:00", vale1: "100" },
      ]),
      "1",
    );
    expect(series.points.map((p) => p.price)).toEqual([100, 102]);
  });

  it("throws on an HTML body rather than reporting an empty session", () => {
    expect(() => parseBseIntraday("<html>blocked</html>", "1")).toThrow(/HTML/);
  });

  it("falls back to the last point when CurrVal is absent", () => {
    const series = parseBseIntraday(
      envelope([{ dttm: "Mon Aug 31 2026 09:15:00", vale1: "123.45" }], { CurrVal: null }),
      "1",
    );
    expect(series.lastPrice).toBe(123.45);
  });
});
