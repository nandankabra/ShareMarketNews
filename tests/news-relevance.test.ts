import { describe, expect, it } from "vitest";

import { headlineRelevance, isRelevantHeadline } from "@/lib/news/relevance";

/**
 * Every title below was pulled from the live feed during the build. The
 * irrelevant ones are the actual padding Google News returned for a company
 * whose query had few real matches.
 */
describe("headlineRelevance", () => {
  const pfc = ["Power Finance Corporation Ltd.", "PFC"] as const;
  const whirlpool = ["Whirlpool of India Ltd.", "WHIRLPOOL"] as const;
  const pvr = ["PVR INOX Ltd.", "PVRINOX"] as const;

  it.each([
    ["Power Finance Corporation and REC shares fall up to 3% after Morgan Stanley downgrade", ...pfc],
    ["PFC, REC drop up to 3% as Morgan Stanley downgrades amid loan growth woes", ...pfc],
    ["PFC Outlook for the Week (August 24, 2026)", ...pfc],
    ["REC merger into Power Finance Corporation approved by President of India", ...pfc],
    ["Whirlpool of India approves ESOP plan, appoints Aditya Jain as director", ...whirlpool],
    ["Whirlpool India Focuses On Premium Growth Independently Under 39.7% Parent Stake", ...whirlpool],
    ["PVR Inox Share Buyback: Board Meets Aug 31, Stock at High", ...pvr],
    ["PVRINOX Outlook for the Week", ...pvr],
  ])("keeps %s", (title, name, symbol) => {
    expect(isRelevantHeadline(title, name, symbol)).toBe(true);
  });

  it.each([
    ["Where was The Odyssey filmed? (with maps)", ...whirlpool],
    ["Video: Humid feel, showers possible Sunday", ...whirlpool],
    ["Watch: Prize cow creates 'dream' year for Cork exhibitor duo", ...whirlpool],
    ["Reform a legacy of former MP: McCormack", ...whirlpool],
    ["985 University Master Forced to Tighten Screws on Assembly Line", ...whirlpool],
    ["News by CNBC TV18 on TradingView, 2026-08-23", ...whirlpool],
  ])("drops %s", (title, name, symbol) => {
    expect(isRelevantHeadline(title, name, symbol)).toBe(false);
  });

  it("will not match on a generic word alone", () => {
    // "Power" on its own would pull in half the market for Power Finance.
    expect(isRelevantHeadline("Tata Power wins solar order", "Power Finance Corporation Ltd.", "PFC")).toBe(false);
    expect(isRelevantHeadline("Steel demand rises in India", "Tata Steel Ltd.", "TATASTEEL")).toBe(false);
  });

  it("does not match a ticker inside a longer word", () => {
    expect(isRelevantHeadline("The rebel alliance regrouped", "Bharat Electronics Ltd.", "BEL")).toBe(false);
    expect(isRelevantHeadline("BEL wins defence order", "Bharat Electronics Ltd.", "BEL")).toBe(true);
  });

  it("explains itself, so a dropped story can be accounted for", () => {
    expect(headlineRelevance("PFC Outlook for the Week", ...pfc).reason).toContain("PFC");
    expect(headlineRelevance("Video: Cool temps ahead", ...whirlpool).reason).toContain("not named");
  });
});
