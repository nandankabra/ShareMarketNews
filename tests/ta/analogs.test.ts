import { describe, expect, it } from "vitest";

import { findAnalogs } from "@/lib/ta/analogs";

/** A repeating saw shape, so a window has something to match elsewhere. */
function repeating(cycles: number, period = 12, amplitude = 4): number[] {
  const out: number[] = [];
  for (let i = 0; i < cycles * period; i++) {
    out.push(100 + Math.sin((i / period) * Math.PI * 2) * amplitude + i * 0.05);
  }
  return out;
}

describe("findAnalogs", () => {
  it("finds nothing when there is not enough history to look back over", () => {
    const study = findAnalogs([100, 101, 102, 103, 104], { window: 10, horizon: 5 });
    expect(study.matches).toEqual([]);
    expect(study.candidates).toBe(0);
  });

  it("finds the earlier stretch that traced the same shape", () => {
    const study = findAnalogs(repeating(6), { window: 12, horizon: 4 });
    expect(study.matches.length).toBeGreaterThan(0);
    expect(study.matches.every((match) => match.similarity >= 0.7)).toBe(true);
    expect(study.candidates).toBeGreaterThan(study.matches.length);
  });

  it("never matches the window against itself", () => {
    const closes = repeating(6);
    const study = findAnalogs(closes, { window: 12, horizon: 4 });
    // Anything at or past this index would overlap the pattern being matched.
    for (const match of study.matches) {
      expect(match.index).toBeLessThan(closes.length - 12);
    }
  });

  it("counts one episode once, rather than once per overlapping window", () => {
    const study = findAnalogs(repeating(8), { window: 12, horizon: 4, maxMatches: 8 });
    const indices = study.matches.map((match) => match.index).sort((a, b) => a - b);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i] - indices[i - 1]).toBeGreaterThanOrEqual(12);
    }
  });

  it("reports the spread of what followed, not just the middle", () => {
    const study = findAnalogs(repeating(8), { window: 12, horizon: 4, maxMatches: 8 });
    expect(study.medianFollow).not.toBeNull();
    expect(study.bestFollow!).toBeGreaterThanOrEqual(study.medianFollow!);
    expect(study.worstFollow!).toBeLessThanOrEqual(study.medianFollow!);
    expect(study.upCount + study.downCount).toBeLessThanOrEqual(study.matches.length);
  });

  it("measures what followed from the end of the matched window", () => {
    const closes = repeating(6);
    const study = findAnalogs(closes, { window: 12, horizon: 4 });
    for (const match of study.matches) {
      const expected = ((closes[match.index + 4] - closes[match.index]) / closes[match.index]) * 100;
      expect(match.followPercent).toBeCloseTo(expected, 10);
    }
  });

  it("matches on shape, not on price level", () => {
    // The same path twice, the second half at twenty times the price.
    const shape = repeating(3);
    const study = findAnalogs([...shape, ...shape.map((value) => value * 20)], { window: 12, horizon: 3 });
    expect(study.matches.length).toBeGreaterThan(0);
  });

  it("finds nothing in a series with no shape to speak of", () => {
    const flat = new Array(120).fill(100);
    const study = findAnalogs(flat, { window: 12, horizon: 4 });
    expect(study.matches).toEqual([]);
  });

  it("measures the drift every window shared, not just the matched ones", () => {
    // A series that only ever rises: any forward window is positive, so the
    // baseline has to be positive too — that is the whole point of it.
    const rising = Array.from({ length: 120 }, (_, i) => 100 * 1.01 ** i);
    const study = findAnalogs(rising, { window: 12, horizon: 4 });
    expect(study.baselineFollow).not.toBeNull();
    expect(study.baselineFollow!).toBeGreaterThan(0);
  });

  it("still has a baseline when nothing matched at all", () => {
    // A walk with no repeating shape in it, searched with a bar nothing clears.
    let seed = 7;
    const walk = [100];
    for (let i = 1; i < 140; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      walk.push(walk[i - 1] * (1 + (seed / 233280 - 0.5) / 50));
    }

    const study = findAnalogs(walk, { window: 12, horizon: 4, minSimilarity: 0.99 });
    expect(study.matches).toEqual([]);
    expect(study.candidates).toBeGreaterThan(0);
    expect(study.baselineFollow).not.toBeNull();
  });

  it("respects a stricter similarity floor", () => {
    const closes = repeating(8);
    const loose = findAnalogs(closes, { window: 12, horizon: 4, minSimilarity: 0.5, maxMatches: 8 });
    const strict = findAnalogs(closes, { window: 12, horizon: 4, minSimilarity: 0.97, maxMatches: 8 });
    expect(strict.matches.length).toBeLessThanOrEqual(loose.matches.length);
  });
});
