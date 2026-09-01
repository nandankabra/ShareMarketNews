import { describe, expect, it } from "vitest";

import { periodReturn, rankRelativeStrength } from "@/lib/ta/relative-strength";

describe("periodReturn", () => {
  it("measures percent change from N sessions ago to the latest close", () => {
    const closes = [100, 101, 102, 103, 104, 110];
    expect(periodReturn(closes, 5)).toBeCloseTo(10, 10);
  });

  it("returns null when there isn't enough history for the window", () => {
    expect(periodReturn([100, 101], 5)).toBeNull();
  });
});

describe("rankRelativeStrength", () => {
  it("ranks the best return first", () => {
    const ranked = rankRelativeStrength([
      { symbol: "A", returnPercent: 5 },
      { symbol: "B", returnPercent: 15 },
      { symbol: "C", returnPercent: -3 },
    ]);
    expect(ranked.map((row) => row.symbol)).toEqual(["B", "A", "C"]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].percentile).toBe(100);
    expect(ranked.at(-1)!.percentile).toBe(0);
  });

  it("gives a single row the full percentile rather than dividing by zero", () => {
    const ranked = rankRelativeStrength([{ symbol: "A", returnPercent: 5 }]);
    expect(ranked[0].percentile).toBe(100);
  });
});
