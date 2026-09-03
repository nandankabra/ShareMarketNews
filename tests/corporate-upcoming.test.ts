import { describe, expect, it } from "vitest";

import { parseDividendAmount, upcomingActions } from "@/lib/corporate/upcoming";
import type { CorporateAction } from "@/lib/providers/nse/parse-corporate-actions";
import type { UpcomingEvent } from "@/lib/providers/nse/parse-event-calendar";

const TODAY = "2026-09-03";

function action(over: Partial<CorporateAction>): CorporateAction {
  return {
    symbol: "ACE",
    company: "Action Construction Equipment Limited",
    type: "DIVIDEND",
    eventDate: "2026-09-10",
    recordDate: "2026-09-10",
    description: "Dividend - Rs 2 Per Share",
    raw: "",
    ...over,
  };
}

function event(over: Partial<UpcomingEvent>): UpcomingEvent {
  return {
    symbol: "COMSYN",
    company: "Commercial Syn Bags Limited",
    type: "DIVIDEND",
    eventDate: "2026-09-05",
    description: "To consider dividend and Fund Raising",
    raw: "",
    ...over,
  };
}

describe("parseDividendAmount", () => {
  it("reads the rupee amount from the shapes NSE actually sends", () => {
    // Both spellings appear in one day's feed.
    expect(parseDividendAmount("Dividend - Rs 2 Per Share")).toBe(2);
    expect(parseDividendAmount("Dividend - Re 0.05 Per Share")).toBe(0.05);
    expect(parseDividendAmount("Dividend - Rs 12.50 Per Share")).toBe(12.5);
    expect(parseDividendAmount("Dividend - Rs 1,250 Per Share")).toBe(1250);
  });

  it("is null when no per-share amount is stated", () => {
    expect(parseDividendAmount("To consider dividend and other business matters")).toBeNull();
    expect(parseDividendAmount("Buy Back")).toBeNull();
  });

  it("does not mistake a digit in a company name for a payout", () => {
    // The amount must be the number attached to "per share", not the first one.
    expect(parseDividendAmount("3M India Dividend")).toBeNull();
    expect(parseDividendAmount("3M India Dividend - Rs 685 Per Share")).toBe(685);
  });
});

describe("upcomingActions", () => {
  it("separates buybacks from dividends", () => {
    const result = upcomingActions(
      [
        action({ symbol: "PVRINOX", type: "BUYBACK", description: "Buy Back", eventDate: "2026-09-04" }),
        action({ symbol: "OIL", description: "Dividend - Re 1 Per Share", eventDate: "2026-09-04" }),
      ],
      [],
      TODAY,
    );

    expect(result.buybacks.map((a) => a.symbol)).toEqual(["PVRINOX"]);
    expect(result.dividends.map((a) => a.symbol)).toEqual(["OIL"]);
    expect(result.dividends[0].amount).toBe(1);
  });

  it("drops anything already past, and keeps today", () => {
    // A share trades cum-dividend right up to the ex-date, so today still counts.
    const result = upcomingActions(
      [
        action({ symbol: "GONE", eventDate: "2026-09-02" }),
        action({ symbol: "TODAY", eventDate: TODAY }),
        action({ symbol: "SOON", eventDate: "2026-09-20" }),
      ],
      [],
      TODAY,
    );

    expect(result.dividends.map((a) => a.symbol)).toEqual(["TODAY", "SOON"]);
  });

  it("marks a board meeting as expected rather than declared", () => {
    const result = upcomingActions([], [event({})], TODAY);

    expect(result.dividends[0]).toMatchObject({ symbol: "COMSYN", stage: "EXPECTED", amount: null });
  });

  it("prefers the declared action when a share appears in both feeds", () => {
    // The meeting that declared the dividend is often still on the calendar.
    // Listing both would read as two separate dividends.
    const result = upcomingActions(
      [action({ symbol: "COMSYN", eventDate: "2026-09-12", description: "Dividend - Rs 4 Per Share" })],
      [event({ symbol: "COMSYN", eventDate: "2026-09-05" })],
      TODAY,
    );

    expect(result.dividends).toHaveLength(1);
    expect(result.dividends[0]).toMatchObject({ stage: "DECLARED", amount: 4 });
  });

  it("orders by date and caps the list", () => {
    const result = upcomingActions(
      [
        action({ symbol: "C", eventDate: "2026-09-20" }),
        action({ symbol: "A", eventDate: "2026-09-05" }),
        action({ symbol: "B", eventDate: "2026-09-10" }),
      ],
      [],
      TODAY,
      2,
    );

    expect(result.dividends.map((a) => a.symbol)).toEqual(["A", "B"]);
  });

  it("keeps room for scheduled meetings when declared ex-dates would fill the list", () => {
    // A single day can carry six dividends going ex. Straight date order fills
    // every slot with them and "who is about to announce one" never appears —
    // which is the half of the question the panel exists to answer.
    const declared = Array.from({ length: 10 }, (_, i) =>
      action({ symbol: `DECL${i}`, eventDate: TODAY, description: "Dividend - Rs 1 Per Share" }),
    );
    const meetings = [
      event({ symbol: "MEET1", eventDate: "2026-09-05" }),
      event({ symbol: "MEET2", eventDate: "2026-09-07" }),
    ];

    const result = upcomingActions(declared, meetings, TODAY, 6);

    expect(result.dividends).toHaveLength(6);
    expect(result.dividends.filter((a) => a.stage === "EXPECTED").map((a) => a.symbol)).toEqual([
      "MEET1",
      "MEET2",
    ]);
  });

  it("gives the reserved slots back when there are no meetings to fill them", () => {
    const declared = Array.from({ length: 10 }, (_, i) =>
      action({ symbol: `DECL${i}`, eventDate: TODAY }),
    );

    const result = upcomingActions(declared, [], TODAY, 6);

    expect(result.dividends).toHaveLength(6);
    expect(result.dividends.every((a) => a.stage === "DECLARED")).toBe(true);
  });

  it("ignores event types that are neither", () => {
    const result = upcomingActions(
      [action({ symbol: "SPLITCO", type: "SPLIT", description: "Face Value Split" })],
      [event({ symbol: "AGMCO", type: "AGM" })],
      TODAY,
    );

    expect(result.buybacks).toEqual([]);
    expect(result.dividends).toEqual([]);
  });
});
