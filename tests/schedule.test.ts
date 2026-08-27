import { describe, expect, it } from "vitest";

import { dueTasks, type FetchRow } from "@/lib/refresh/schedule";
import type { SourceKey } from "@/lib/db/enums";

const ALL: SourceKey[] = [
  "NSE_MARKET_STATUS", "NSE_ALL_INDICES", "NSE_EQUITY_MASTER", "NSE_EVENT_CALENDAR",
  "NSE_CORPORATE_ACTIONS", "NSE_OPTION_CHAIN", "NIFTY_CONSTITUENTS", "YAHOO_QUOTES",
  "YAHOO_SEARCH", "GOOGLE_NEWS",
];

/** Every source succeeded `minutesAgo` ago and nothing is backing off. */
function rows(now: Date, minutesAgo: number, overrides: Partial<Record<SourceKey, Partial<FetchRow>>> = {}): FetchRow[] {
  return ALL.map((source) => ({
    source,
    lastSuccessAt: new Date(now.getTime() - minutesAgo * 60_000),
    nextEligibleAt: null,
    ...overrides[source],
  }));
}

// 2026-08-27 is a Thursday. 05:00Z = 10:30 IST, mid-session.
const MID_SESSION = new Date("2026-08-27T05:00:00Z");

describe("dueTasks", () => {
  it("runs everything on a cold start", () => {
    const cold = ALL.map((source) => ({ source, lastSuccessAt: null, nextEligibleAt: null }));
    const due = dueTasks(MID_SESSION, true, cold);
    expect(due).toContain("quotes");
    expect(due).toContain("marketStatus");
  });

  it("holds quotes back until their cadence has elapsed", () => {
    expect(dueTasks(MID_SESSION, true, rows(MID_SESSION, 0))).not.toContain("quotes");
    expect(dueTasks(MID_SESSION, true, rows(MID_SESSION, 2))).toContain("quotes");
  });

  it("slows right down once the market shuts", () => {
    const afterHours = new Date("2026-08-27T12:00:00Z"); // 17:30 IST
    const open = dueTasks(MID_SESSION, true, rows(MID_SESSION, 10));
    const closed = dueTasks(afterHours, false, rows(afterHours, 10));
    expect(open).toContain("sectorLevels");
    expect(closed).not.toContain("sectorLevels");
    expect(closed).not.toContain("optionChain");
  });

  it("respects a source that is backing off", () => {
    const backing = rows(MID_SESSION, 60, {
      YAHOO_QUOTES: { nextEligibleAt: new Date(MID_SESSION.getTime() + 30 * 60_000) },
    });
    expect(dueTasks(MID_SESSION, true, backing)).not.toContain("quotes");
  });

  it("fires a daily task once inside its window, not on every tick", () => {
    // 02:45Z = 08:15 IST, the corporate-events window.
    const inWindow = new Date("2026-08-27T02:45:00Z");
    const never = rows(inWindow, 10_000);
    expect(dueTasks(inWindow, false, never)).toContain("corporateEvents");

    // Having just succeeded, it must not fire again on the next tick.
    const justRan = rows(inWindow, 1);
    expect(dueTasks(inWindow, false, justRan)).not.toContain("corporateEvents");
  });

  it("stays out of a daily window it is not in", () => {
    const outOfWindow = new Date("2026-08-27T06:00:00Z"); // 11:30 IST
    expect(dueTasks(outOfWindow, true, rows(outOfWindow, 10_000))).not.toContain("corporateEvents");
  });

  it("does almost nothing at the weekend", () => {
    // 2026-08-29 is a Saturday, 08:15 IST.
    const saturday = new Date("2026-08-29T02:45:00Z");
    const due = dueTasks(saturday, false, rows(saturday, 10_000));
    expect(due).not.toContain("corporateEvents");
    expect(due).not.toContain("sectorConstituents");
  });

  it("still prunes at the weekend", () => {
    // 21:30Z Friday = 03:00 IST Saturday, the prune window.
    const saturdayEarly = new Date("2026-08-28T21:30:00Z");
    expect(dueTasks(saturdayEarly, false, rows(saturdayEarly, 10_000))).toContain("prune");
  });
});
