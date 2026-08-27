import { describe, expect, it } from "vitest";

import { classifyHeadline } from "@/lib/news/classify";
import { describeReaction, summariseReaction } from "@/lib/news/reaction";

describe("classifyHeadline", () => {
  it.each([
    ["Coforge bags multi-year deal with European insurer", "ORDER_WIN", "POSITIVE"],
    ["Sun Pharma Q1 profit beats estimates on US specialty sales", "RESULTS", "POSITIVE"],
    ["Brokerage cuts TCS target price, downgrades to hold", "RATING", "NEGATIVE"],
    ["SEBI approves new settlement framework", "REGULATORY", "POSITIVE"],
    ["CFO resigns citing personal reasons", "MANAGEMENT", "NEGATIVE"],
    ["Board declares interim dividend of Rs 3.90", "DIVIDEND_ACTION", "NEUTRAL"],
  ])("classifies %s", (title, category, polarity) => {
    const result = classifyHeadline(title);
    expect(result.category).toBe(category);
    expect(result.polarity).toBe(polarity);
  });

  it("keeps the terms that fired so the tag can be justified on screen", () => {
    // A tag nobody can interrogate is worse than no tag.
    const result = classifyHeadline("Infosys bags a large order from a European bank");
    expect(result.matchedTerms.length).toBeGreaterThan(0);
    expect(result.matchedTerms.join(" ")).toMatch(/bags/);
  });

  it("falls back to OTHER rather than guessing", () => {
    const result = classifyHeadline("A quiet day at the office");
    expect(result.category).toBe("OTHER");
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("scores confidence from how much evidence fired", () => {
    const weak = classifyHeadline("Company announces something");
    const strong = classifyHeadline("Q2 net profit beats estimates as revenue surges");
    expect(strong.confidence).toBeGreaterThan(weak.confidence);
  });

  it("handles an empty headline", () => {
    expect(classifyHeadline("").category).toBe("OTHER");
    expect(classifyHeadline("   ").confidence).toBe(0);
  });
});

describe("summariseReaction", () => {
  it("refuses to quote a range off too few days", () => {
    // The whole point of this module: a confident-looking number built on two
    // data points is the failure mode being avoided.
    const result = summariseReaction({
      newsDayMoves: [4.2, 6.0],
      avgAbsChangePercent20d: 1.8,
      atrPercent: 1.9,
    });
    expect(result.kind).toBe("INSUFFICIENT");
    expect(describeReaction(result, "TCS")).toMatch(/Not enough past news days/);
  });

  it("quotes the 20th-80th percentile, not the extremes", () => {
    // One freak session should not define the range a reader takes away.
    const result = summariseReaction({
      newsDayMoves: [1, 4, 4.5, 5, 22],
      avgAbsChangePercent20d: 1.8,
      atrPercent: 1.9,
    });
    expect(result.kind).toBe("RANGE");
    if (result.kind !== "RANGE") return;
    expect(result.lowPercent).toBeGreaterThan(1);
    expect(result.highPercent).toBeLessThan(22);
    expect(result.sampleSize).toBe(5);
  });

  it("describes without predicting", () => {
    const result = summariseReaction({
      newsDayMoves: [4.2, 5.1, 6.0, 7.1],
      avgAbsChangePercent20d: 1.8,
      atrPercent: 1.9,
    });
    const sentence = describeReaction(result, "TCS");
    expect(sentence).toMatch(/typically swings 1\.8%/);
    expect(sentence).toMatch(/heaviest-news days/);
    // No forward-looking language anywhere in the output.
    expect(sentence).not.toMatch(/will|expect|forecast|target|should/i);
  });

  it("says so when the share has no settled range yet", () => {
    const result = summariseReaction({ newsDayMoves: [], avgAbsChangePercent20d: null, atrPercent: null });
    expect(describeReaction(result, "NEWCO")).toMatch(/no settled daily range/);
  });
});
