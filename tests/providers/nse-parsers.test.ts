import { describe, expect, it } from "vitest";

import { classifyEvent } from "@/lib/providers/nse/classify-event";
import { parseAllIndices } from "@/lib/providers/nse/parse-all-indices";
import { parseCorporateActions } from "@/lib/providers/nse/parse-corporate-actions";
import { parseEventCalendar } from "@/lib/providers/nse/parse-event-calendar";
import { parseMarketStatus } from "@/lib/providers/nse/parse-market-status";
import { parseOptionChain } from "@/lib/providers/nse/parse-option-chain";

import { fixture } from "../helpers/fixtures";

describe("parseMarketStatus", () => {
  it("reads the capital-market row and ignores the rest", () => {
    const status = parseMarketStatus(fixture("nse-market-status.json"));
    expect(status.status).toBe("Closed");
    expect(status.isOpen).toBe(false);
    expect(status.niftyLevel).toBeCloseTo(24207.75, 2);
  });

  it("survives the empty-string numerics on non-equity rows", () => {
    // Currency, commodity and debt rows ship `last: ""`. A strict number schema
    // failed the whole payload over rows this app never reads — the bug this
    // test exists to keep fixed.
    expect(() => parseMarketStatus(fixture("nse-market-status.json"))).not.toThrow();
  });

  it("rejects a non-JSON body as SHAPE", () => {
    expect(() => parseMarketStatus("<html>nope</html>")).toThrowError(/not JSON/);
  });
});

describe("parseEventCalendar", () => {
  it("parses board meetings with IST day keys", () => {
    const events = parseEventCalendar(fixture("nse-event-calendar.json"));
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.eventDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(event.symbol).toBe(event.symbol.toUpperCase());
    }
  });

  it("skips malformed rows rather than failing the batch", () => {
    const body = JSON.stringify([
      { symbol: "GOOD", date: "28-Aug-2026", purpose: "Financial Results" },
      { symbol: "BAD", date: "not-a-date" },
      { nothing: true },
    ]);
    const events = parseEventCalendar(body);
    expect(events).toHaveLength(1);
    expect(events[0].symbol).toBe("GOOD");
    expect(events[0].type).toBe("EARNINGS");
  });
});

describe("parseCorporateActions", () => {
  it("keys events off the ex-date", () => {
    const actions = parseCorporateActions(fixture("nse-corporate-actions.json"));
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((action) => /^\d{4}-\d{2}-\d{2}$/.test(action.eventDate))).toBe(true);
    expect(actions.some((action) => action.type === "DIVIDEND")).toBe(true);
  });
});

describe("classifyEvent", () => {
  it("prefers earnings over the board meeting that carries it", () => {
    // Both patterns match this text; the useful label is the specific one.
    expect(classifyEvent("Financial Results", "Board meeting to consider and approve results")).toBe("EARNINGS");
  });

  it.each([
    ["Interim Dividend - Rs 3.90 Per Share", "DIVIDEND"],
    ["Bonus issue in the ratio 1:1", "BONUS"],
    ["Stock Split from Rs 10 to Rs 2", "SPLIT"],
    ["Buy-back of equity shares", "BUYBACK"],
    ["To consider and approve the draft Notice of 32nd Annual General Meeting", "AGM"],
    ["Something entirely unremarkable", "OTHER"],
  ])("classifies %s as %s", (text, expected) => {
    expect(classifyEvent(text)).toBe(expected);
  });

  it("shrugs rather than guessing on empty input", () => {
    expect(classifyEvent(null, undefined, "")).toBe("OTHER");
  });
});

describe("parseAllIndices", () => {
  it("returns every listed index", () => {
    const indices = parseAllIndices(fixture("nse-all-indices.json"));
    expect(indices.length).toBeGreaterThan(100);
    expect(indices.some((index) => index.index === "NIFTY IT")).toBe(true);
  });
});

describe("parseOptionChain", () => {
  it("finds the expiry on the CE/PE objects, not the row", () => {
    // The row's own `expiryDates` key is null and the real value lives on
    // CE/PE as DD-MM-YYYY. Requiring it at row level silently emptied the
    // entire chain — this test pins the shape that actually ships.
    const chain = parseOptionChain(fixture("nse-option-chain-nifty.json"), "2026-09-01");
    expect(chain.rows.length).toBeGreaterThan(50);
    expect(chain.underlyingValue).toBeGreaterThan(0);
    expect(chain.rows.every((row) => row.ce || row.pe)).toBe(true);
  });

  it("keeps strikes sorted", () => {
    const chain = parseOptionChain(fixture("nse-option-chain-nifty.json"), "2026-09-01");
    const strikes = chain.rows.map((row) => row.strikePrice);
    expect([...strikes].sort((a, b) => a - b)).toEqual(strikes);
  });

  it("treats a zero implied volatility as absent, not as zero", () => {
    const chain = parseOptionChain(fixture("nse-option-chain-nifty.json"), "2026-09-01");
    const ivs = chain.rows.flatMap((row) => [row.ce?.iv, row.pe?.iv]);
    expect(ivs.every((iv) => iv == null || iv > 0)).toBe(true);
  });

  it("reports an unknown expiry as NOT_FOUND", () => {
    expect(() =>
      parseOptionChain(fixture("nse-option-chain-nifty.json"), "2030-01-01"),
    ).toThrowError(/no strikes/);
  });
});
