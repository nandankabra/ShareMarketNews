import { describe, expect, it } from "vitest";

import { compositeRelativeStrength, periodReturn, rankRelativeStrength } from "@/lib/ta/relative-strength";

/** `length` closes rising by `perSession` percent a session, oldest first. */
function ramp(length: number, perSession: number): number[] {
  const out = [100];
  for (let i = 1; i < length; i++) out.push(out[i - 1] * (1 + perSession / 100));
  return out;
}

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

describe("compositeRelativeStrength", () => {
  it("puts the share that leads every window at the top and the laggard at the bottom", () => {
    const result = compositeRelativeStrength([
      { symbol: "FAST", closes: ramp(70, 0.5) },
      { symbol: "SLOW", closes: ramp(70, 0.1) },
      { symbol: "FLAT", closes: ramp(70, 0) },
    ]);
    const score = (symbol: string) => result.find((row) => row.symbol === symbol)!.score;
    expect(score("FAST")).toBe(100);
    expect(score("FLAT")).toBe(0);
    expect(score("SLOW")!).toBeGreaterThan(0);
    expect(score("SLOW")!).toBeLessThan(100);
  });

  it("reports the return behind every window it could measure", () => {
    const [row] = compositeRelativeStrength([{ symbol: "A", closes: ramp(70, 0.5) }]);
    expect(row.returns[5]).not.toBeNull();
    expect(row.returns[20]).not.toBeNull();
    expect(row.returns[60]).not.toBeNull();
    expect(row.returns[60]!).toBeGreaterThan(row.returns[5]!);
  });

  it("scores off the windows that fit when history is short", () => {
    const [row] = compositeRelativeStrength([{ symbol: "A", closes: ramp(10, 0.5) }]);
    expect(row.returns[5]).not.toBeNull();
    expect(row.returns[20]).toBeNull();
    expect(row.returns[60]).toBeNull();
    expect(row.score).toBe(100);
  });

  it("has no score for a share with no window long enough to rank", () => {
    const [row] = compositeRelativeStrength([{ symbol: "A", closes: [100, 101] }]);
    expect(row.score).toBeNull();
  });
});
