import { describe, expect, it } from "vitest";

import { correlationMatrix, pearsonCorrelation } from "@/lib/ta/correlation";

/** A random-walk-ish base series, long enough to clear the overlap floor. */
function baseSeries(length: number, seed = 1): number[] {
  const out: number[] = [100];
  let value = 100;
  let s = seed;
  for (let i = 1; i < length; i++) {
    s = (s * 9301 + 49297) % 233280;
    value += (s / 233280 - 0.5) * 2;
    out.push(value);
  }
  return out;
}

describe("pearsonCorrelation", () => {
  it("is 1 for a series against itself", () => {
    const series = baseSeries(30);
    expect(pearsonCorrelation(series, series)).toBeCloseTo(1, 5);
  });

  it("is -1 for a series against its own mirror", () => {
    const series = baseSeries(30);
    const mirrored = series.map((value) => 200 - value);
    expect(pearsonCorrelation(series, mirrored)).toBeCloseTo(-1, 5);
  });

  it("is null when either series is constant", () => {
    const flat = new Array(30).fill(100);
    expect(pearsonCorrelation(flat, baseSeries(30))).toBeNull();
  });

  it("is null below the overlap floor", () => {
    expect(pearsonCorrelation([1, 2, 3], [1, 2, 3])).toBeNull();
  });
});

describe("correlationMatrix", () => {
  it("is 1 on the diagonal and symmetric off it", () => {
    const result = correlationMatrix([
      { symbol: "A", closes: baseSeries(80, 1) },
      { symbol: "B", closes: baseSeries(80, 7) },
    ]);
    expect(result.matrix[0][0]).toBe(1);
    expect(result.matrix[1][1]).toBe(1);
    expect(result.matrix[0][1]).toBeCloseTo(result.matrix[1][0]!, 10);
  });

  it("preserves symbol order", () => {
    const result = correlationMatrix([
      { symbol: "A", closes: baseSeries(80, 1) },
      { symbol: "B", closes: baseSeries(80, 2) },
      { symbol: "C", closes: baseSeries(80, 3) },
    ]);
    expect(result.symbols).toEqual(["A", "B", "C"]);
    expect(result.matrix).toHaveLength(3);
  });
});
