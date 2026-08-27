import { describe, expect, it } from "vitest";

import { analyseChain, classifyBuildup, inferStrikeStep, maxPain, mostTraded } from "@/lib/options/analytics";
import { parseOptionChain } from "@/lib/providers/nse/parse-option-chain";
import type { OptionRow } from "@/lib/providers/nse/parse-option-chain";

import { fixture } from "./helpers/fixtures";

const chain = () => parseOptionChain(fixture("nse-option-chain-nifty.json"), "2026-09-01");

describe("classifyBuildup", () => {
  it.each([
    [{ change: 5, oiChange: 1000, oi: 10000 }, "LONG_BUILDUP"],
    [{ change: -5, oiChange: 1000, oi: 10000 }, "SHORT_BUILDUP"],
    [{ change: 5, oiChange: -1000, oi: 10000 }, "SHORT_COVERING"],
    [{ change: -5, oiChange: -1000, oi: 10000 }, "LONG_UNWINDING"],
  ])("reads price against open interest", (side, expected) => {
    expect(
      classifyBuildup({ ...side, volume: 1, iv: 10, ltp: 20 }),
    ).toBe(expected);
  });

  it("calls a rounding-noise move FLAT rather than a position change", () => {
    // Without a threshold, an untraded strike's tiny drift gets dressed up as
    // fresh positioning, which is the fastest way to make this column lie.
    expect(
      classifyBuildup({ change: 0.001, oiChange: 1, oi: 100000, volume: 0, iv: null, ltp: 1 }),
    ).toBe("FLAT");
  });

  it("returns null when the upstream gave us nothing to judge", () => {
    expect(classifyBuildup(null)).toBeNull();
    expect(
      classifyBuildup({ change: null, oiChange: null, oi: 1, volume: 1, iv: 1, ltp: 1 }),
    ).toBeNull();
  });
});

describe("maxPain", () => {
  it("finds the strike where writers lose least", () => {
    // All the open interest is calls at 100. Settling at or below 100 costs
    // those writers nothing, so pain is minimised at the lowest strike.
    const rows: OptionRow[] = [90, 100, 110].map((strike) => ({
      strikePrice: strike,
      ce: { oi: strike === 100 ? 10_000 : 0, oiChange: 0, volume: 0, iv: null, ltp: null, change: null },
      pe: null,
    }));
    expect(maxPain(rows)).toBe(90);
  });

  it("balances calls against puts", () => {
    const rows: OptionRow[] = [
      { strikePrice: 100, ce: side(0), pe: side(5_000) },
      { strikePrice: 110, ce: side(5_000), pe: side(0) },
    ];
    // Settling at 100 costs put writers nothing and call writers nothing.
    expect(maxPain(rows)).toBe(100);
  });
});

function side(oi: number) {
  return { oi, oiChange: 0, volume: 0, iv: null, ltp: null, change: null };
}

describe("analyseChain", () => {
  it("derives the standard readings from a real chain", () => {
    const analytics = analyseChain(chain());

    expect(analytics.underlyingValue).toBeGreaterThan(0);
    expect(analytics.pcrOi).toBeGreaterThan(0);
    expect(analytics.totalCeOi).toBeGreaterThan(0);
    expect(analytics.totalPeOi).toBeGreaterThan(0);

    // ATM must be the listed strike nearest spot, not spot rounded.
    const distances = analytics.rows.map((row) => Math.abs(row.strikePrice - analytics.underlyingValue));
    expect(Math.abs(analytics.atmStrike - analytics.underlyingValue)).toBe(Math.min(...distances));

    expect(analytics.rows.some((row) => row.isAtm)).toBe(true);
  });

  it("puts OI-derived support below resistance on a normal chain", () => {
    const analytics = analyseChain(chain());
    expect(analytics.oiResistance).not.toBeNull();
    expect(analytics.oiSupport).not.toBeNull();
  });

  it("ranks the busiest contracts by traded volume", () => {
    const analytics = analyseChain(chain());
    const top = mostTraded(analytics, 5);
    expect(top).toHaveLength(5);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].volume).toBeGreaterThanOrEqual(top[i].volume);
    }
    expect(top.every((entry) => entry.side === "CE" || entry.side === "PE")).toBe(true);
  });
});

describe("inferStrikeStep", () => {
  it("takes the commonest gap rather than assuming one", () => {
    expect(inferStrikeStep([{ strikePrice: 100 }, { strikePrice: 150 }, { strikePrice: 200 }])).toBe(50);
  });

  it("survives an irregular gap in the ladder", () => {
    expect(
      inferStrikeStep([
        { strikePrice: 24000 },
        { strikePrice: 24050 },
        { strikePrice: 24100 },
        { strikePrice: 24300 },
      ]),
    ).toBe(50);
  });
});
