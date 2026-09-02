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

  it("seats shares that move together next to each other", () => {
    const base = baseSeries(80, 1);
    const result = correlationMatrix([
      { symbol: "A", closes: base },
      { symbol: "C", closes: baseSeries(80, 31) },
      // Same path at twice the price: identical returns, so a perfect pair
      // with A however far apart they were handed in.
      { symbol: "B", closes: base.map((value) => value * 2) },
    ]);

    const a = result.symbols.indexOf("A");
    const b = result.symbols.indexOf("B");
    expect(Math.abs(a - b)).toBe(1);
    expect(result.matrix).toHaveLength(3);
  });

  it("keeps every cell with the pair it belongs to after reordering", () => {
    const base = baseSeries(80, 1);
    const result = correlationMatrix([
      { symbol: "A", closes: base },
      { symbol: "C", closes: baseSeries(80, 31) },
      { symbol: "B", closes: base.map((value) => value * 2) },
    ]);

    const a = result.symbols.indexOf("A");
    const b = result.symbols.indexOf("B");
    expect(result.matrix[a][b]).toBeCloseTo(1, 5);
    expect(result.matrix[a][a]).toBe(1);
    expect(result.matrix[a][b]).toBeCloseTo(result.matrix[b][a]!, 10);
  });

  it("summarises the pairs it could measure", () => {
    const base = baseSeries(80, 1);
    const result = correlationMatrix([
      { symbol: "A", closes: base },
      { symbol: "C", closes: baseSeries(80, 31) },
      { symbol: "B", closes: base.map((value) => value * 2) },
    ]);

    expect(result.closest).not.toBeNull();
    expect(result.closest!.value).toBeCloseTo(1, 5);
    expect([result.closest!.a, result.closest!.b].sort()).toEqual(["A", "B"]);
    expect(result.loosest!.value).toBeLessThan(result.closest!.value);
    expect(result.average).not.toBeNull();
    expect(result.average!).toBeLessThanOrEqual(1);
  });

  it("has nothing to summarise when no pair can be measured", () => {
    const result = correlationMatrix([
      { symbol: "A", closes: [100, 101, 102] },
      { symbol: "B", closes: [100, 99, 98] },
    ]);
    expect(result.average).toBeNull();
    expect(result.closest).toBeNull();
  });
});
