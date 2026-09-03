import { describe, expect, it } from "vitest";

import {
  EMPTY_CRITERIA,
  isEmptyCriteria,
  matches,
  parseCriteria,
  type ScreenRow,
} from "@/lib/screen/filters";

function row(over: Partial<ScreenRow> = {}): ScreenRow {
  return {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    close: 2400,
    dayChangePercent: 0.5,
    rsi14: 55,
    atrPercent: 1.8,
    fromHighPercent: 8,
    fromLowPercent: 20,
    sma50: 2350,
    sma200: 2300,
    crossDirection: null,
    crossAgeDays: null,
    ...over,
  };
}

describe("matches", () => {
  it("keeps everything when nothing is asked", () => {
    expect(matches(row(), EMPTY_CRITERIA)).toBe(true);
  });

  it("filters on an RSI band", () => {
    expect(matches(row({ rsi14: 25 }), { ...EMPTY_CRITERIA, rsiMax: 30 })).toBe(true);
    expect(matches(row({ rsi14: 45 }), { ...EMPTY_CRITERIA, rsiMax: 30 })).toBe(false);
    expect(matches(row({ rsi14: 75 }), { ...EMPTY_CRITERIA, rsiMin: 70 })).toBe(true);
  });

  it("fails a share that cannot answer the criterion", () => {
    // Too little history to have an RSI. Passing it would read as the screen
    // finding something when it has found a gap in the data.
    expect(matches(row({ rsi14: null }), { ...EMPTY_CRITERIA, rsiMax: 30 })).toBe(false);
    expect(matches(row({ sma200: null }), { ...EMPTY_CRITERIA, vsSma200: "ABOVE" })).toBe(false);
    // But an unasked criterion still ignores the gap.
    expect(matches(row({ rsi14: null }), EMPTY_CRITERIA)).toBe(true);
  });

  it("filters on distance from the 52-week high and low", () => {
    expect(matches(row({ fromHighPercent: 3 }), { ...EMPTY_CRITERIA, nearHighPct: 5 })).toBe(true);
    expect(matches(row({ fromHighPercent: 12 }), { ...EMPTY_CRITERIA, nearHighPct: 5 })).toBe(false);
    expect(matches(row({ fromLowPercent: 4 }), { ...EMPTY_CRITERIA, nearLowPct: 5 })).toBe(true);
  });

  it("filters on which side of a moving average the close sits", () => {
    expect(matches(row({ close: 2400, sma50: 2350 }), { ...EMPTY_CRITERIA, vsSma50: "ABOVE" })).toBe(true);
    expect(matches(row({ close: 2300, sma50: 2350 }), { ...EMPTY_CRITERIA, vsSma50: "ABOVE" })).toBe(false);
    expect(matches(row({ close: 2300, sma50: 2350 }), { ...EMPTY_CRITERIA, vsSma50: "BELOW" })).toBe(true);
  });

  it("filters on a cross direction", () => {
    expect(matches(row({ crossDirection: "GOLDEN" }), { ...EMPTY_CRITERIA, cross: "GOLDEN" })).toBe(true);
    expect(matches(row({ crossDirection: "DEATH" }), { ...EMPTY_CRITERIA, cross: "GOLDEN" })).toBe(false);
    expect(matches(row({ crossDirection: null }), { ...EMPTY_CRITERIA, cross: "GOLDEN" })).toBe(false);
  });

  it("filters on a volatility band", () => {
    expect(matches(row({ atrPercent: 1.2 }), { ...EMPTY_CRITERIA, atrMax: 2 })).toBe(true);
    expect(matches(row({ atrPercent: 4.5 }), { ...EMPTY_CRITERIA, atrMax: 2 })).toBe(false);
    expect(matches(row({ atrPercent: 4.5 }), { ...EMPTY_CRITERIA, atrMin: 3 })).toBe(true);
  });

  it("requires every stated criterion, not any of them", () => {
    const criteria = { ...EMPTY_CRITERIA, rsiMax: 30, vsSma50: "ABOVE" as const };
    expect(matches(row({ rsi14: 25, close: 2400, sma50: 2350 }), criteria)).toBe(true);
    // Passes the RSI half, fails the average half.
    expect(matches(row({ rsi14: 25, close: 2300, sma50: 2350 }), criteria)).toBe(false);
  });
});

describe("parseCriteria", () => {
  it("reads the query string", () => {
    expect(parseCriteria({ rsiMax: "30", sma50: "ABOVE", cross: "GOLDEN", atrMin: "2" })).toMatchObject({
      rsiMax: 30,
      vsSma50: "ABOVE",
      cross: "GOLDEN",
      atrMin: 2,
    });
  });

  it("drops nonsense rather than failing the page", () => {
    // A hand-edited URL should narrow the screen less, never break it.
    expect(parseCriteria({ rsiMax: "banana" }).rsiMax).toBeNull();
    expect(parseCriteria({ rsiMax: "-5" }).rsiMax).toBeNull();
    expect(parseCriteria({ rsiMax: "500" }).rsiMax).toBeNull();
    expect(parseCriteria({ sma50: "SIDEWAYS" }).vsSma50).toBeNull();
    expect(parseCriteria({ rsiMax: "" }).rsiMax).toBeNull();
  });

  it("returns empty criteria for an empty query", () => {
    expect(isEmptyCriteria(parseCriteria({}))).toBe(true);
    expect(isEmptyCriteria(parseCriteria({ rsiMax: "30" }))).toBe(false);
  });
});
