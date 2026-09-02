import { describe, expect, it } from "vitest";

import { confluenceOf, timeframeTrend, type TimeframeTrend } from "@/lib/ta/trend";

function trend(
  label: TimeframeTrend["label"],
  direction: TimeframeTrend["direction"],
  slope: TimeframeTrend["slope"],
): TimeframeTrend {
  return { label, period: 10, direction, distancePercent: direction === "UP" ? 5 : -5, slope };
}

describe("timeframeTrend", () => {
  it("reads a steady climb as up, with the average rising behind it", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const result = timeframeTrend("daily", closes, 20, 5);
    expect(result.direction).toBe("UP");
    expect(result.slope).toBe("UP");
    expect(result.distancePercent).toBeGreaterThan(0);
  });

  it("separates a bounce from a trend: price above a still-falling average", () => {
    // A long decline, then a sharp three-day snap back above the average.
    const decline = Array.from({ length: 60 }, (_, i) => 200 - i * 2);
    const result = timeframeTrend("daily", [...decline, 120, 135, 150], 20, 5);
    expect(result.direction).toBe("UP");
    expect(result.slope).toBe("DOWN");
  });

  it("says nothing at all when the average never fills", () => {
    const result = timeframeTrend("weekly", [100, 101, 102], 20, 4);
    expect(result.distancePercent).toBeNull();
    expect(result.slope).toBeNull();
  });

  it("leaves the slope unknown until there is enough average behind it", () => {
    const closes = Array.from({ length: 22 }, (_, i) => 100 + i);
    const result = timeframeTrend("daily", closes, 20, 10);
    expect(result.direction).toBe("UP");
    expect(result.slope).toBeNull();
  });
});

describe("confluenceOf", () => {
  it("scores a full agreement at the extreme", () => {
    const result = confluenceOf([
      trend("daily", "UP", "UP"),
      trend("weekly", "UP", "UP"),
      trend("monthly", "UP", "UP"),
    ]);
    expect(result.alignment).toBe("FULL");
    expect(result.score).toBe(100);
  });

  it("halves a timeframe's vote when its own average points the other way", () => {
    const confirmed = confluenceOf([trend("daily", "UP", "UP"), trend("weekly", "UP", "UP")]);
    const unconfirmed = confluenceOf([trend("daily", "UP", "DOWN"), trend("weekly", "UP", "UP")]);
    expect(unconfirmed.score).toBeLessThan(confirmed.score);
    expect(unconfirmed.alignment).toBe("FULL");
  });

  it("does not penalise a slope it could not measure", () => {
    const known = confluenceOf([trend("daily", "UP", "UP"), trend("weekly", "UP", "UP")]);
    const unknown = confluenceOf([trend("daily", "UP", null), trend("weekly", "UP", "UP")]);
    expect(unknown.score).toBe(known.score);
  });

  it("weights the monthly above the daily when they disagree", () => {
    const result = confluenceOf([
      trend("daily", "UP", "UP"),
      trend("weekly", "DOWN", "DOWN"),
      trend("monthly", "DOWN", "DOWN"),
    ]);
    expect(result.alignment).toBe("MIXED");
    expect(result.direction).toBe("DOWN");
  });

  it("calls it a majority when the rest are merely flat", () => {
    const result = confluenceOf([
      trend("daily", "FLAT", "UP"),
      trend("weekly", "UP", "UP"),
      trend("monthly", "UP", "UP"),
    ]);
    expect(result.alignment).toBe("MAJORITY");
    expect(result.direction).toBe("UP");
  });

  it("says nothing is trending when nothing is", () => {
    const result = confluenceOf([trend("daily", "FLAT", "FLAT"), trend("weekly", "FLAT", "FLAT")]);
    expect(result.alignment).toBe("NONE");
    expect(result.score).toBe(0);
    expect(result.direction).toBe("FLAT");
  });
});
