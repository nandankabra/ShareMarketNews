import { describe, expect, it } from "vitest";

import { lastCrossover, minOverWindow } from "@/lib/ta/crossover";
import type { Series } from "@/lib/ta/types";

describe("lastCrossover", () => {
  it("finds a golden cross when the fast line rises through the slow one", () => {
    const fast: Series = [1, 2, 3, 5, 6];
    const slow: Series = [4, 4, 4, 4, 4];
    expect(lastCrossover(fast, slow)).toEqual({ direction: "GOLDEN", index: 3 });
  });

  it("finds a death cross", () => {
    const fast: Series = [6, 5, 3, 2, 1];
    const slow: Series = [4, 4, 4, 4, 4];
    expect(lastCrossover(fast, slow)).toEqual({ direction: "DEATH", index: 2 });
  });

  it("reports only the most recent crossing", () => {
    // Crosses up at 1, back down at 3. The latest one is the fact about now.
    const fast: Series = [1, 5, 6, 2, 1];
    const slow: Series = [4, 4, 4, 4, 4];
    expect(lastCrossover(fast, slow)).toEqual({ direction: "DEATH", index: 3 });
  });

  it("returns null when the lines never touch", () => {
    expect(lastCrossover([1, 2, 3], [9, 9, 9])).toBeNull();
  });

  it("skips the leading nulls rather than reading them as a crossing", () => {
    // A moving average is null until its window fills. Treating that as a value
    // would invent a crossover on the first bar the slow average appears.
    const fast: Series = [null, null, 5, 6, 7];
    const slow: Series = [null, null, null, 4, 4];
    expect(lastCrossover(fast, slow)).toBeNull();
  });

  it("handles a series that is entirely null", () => {
    expect(lastCrossover([null, null], [null, null])).toBeNull();
  });
});

describe("minOverWindow", () => {
  it("takes the lowest value in the trailing window", () => {
    expect(minOverWindow([9, 1, 5, 4, 3], 3)).toBe(3);
  });

  it("ignores nulls instead of reading them as zero", () => {
    // Otherwise every series looks permanently squeezed.
    expect(minOverWindow([null, 8, null, 6], 4)).toBe(6);
  });

  it("returns null when the window holds nothing", () => {
    expect(minOverWindow([null, null], 2)).toBeNull();
  });
});
