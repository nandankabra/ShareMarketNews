import { describe, expect, it } from "vitest";

import {
  addDaysIst,
  daysBetween,
  istDayKey,
  istMinutesOfDay,
  isLikelyMarketOpen,
  parseNseDate,
} from "@/lib/date/ist";

describe("istDayKey", () => {
  it("is still the previous IST day just before UTC midnight", () => {
    // The bug this module exists to prevent: a UTC server flips "today" at
    // 18:30 IST — three hours after the market closes — silently dropping that
    // evening's briefing. 23:00 UTC on the 26th is already 04:30 on the 27th.
    expect(istDayKey(new Date("2026-08-26T23:00:00Z"))).toBe("2026-08-27");
    expect(istDayKey(new Date("2026-08-26T18:29:00Z"))).toBe("2026-08-26");
    expect(istDayKey(new Date("2026-08-26T18:31:00Z"))).toBe("2026-08-27");
  });

  it("handles the UTC-midnight boundary itself", () => {
    expect(istDayKey(new Date("2026-08-27T00:00:00Z"))).toBe("2026-08-27");
  });
});

describe("addDaysIst", () => {
  it("crosses a month end", () => {
    expect(addDaysIst("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysIst("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("crosses a year end", () => {
    expect(addDaysIst("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addDaysIst("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("daysBetween", () => {
  it("counts forward and backward", () => {
    expect(daysBetween("2026-08-27", "2026-08-28")).toBe(1);
    expect(daysBetween("2026-08-28", "2026-08-27")).toBe(-1);
    expect(daysBetween("2026-08-27", "2026-08-27")).toBe(0);
  });
});

describe("parseNseDate", () => {
  it("parses NSE's DD-Mon-YYYY", () => {
    expect(parseNseDate("28-Aug-2026")).toBe("2026-08-28");
    expect(parseNseDate("1-Sep-2026")).toBe("2026-09-01");
  });

  it("returns null rather than throwing on junk", () => {
    // One malformed row must not fail a sync of two hundred good ones.
    expect(parseNseDate("not a date")).toBeNull();
    expect(parseNseDate("")).toBeNull();
    expect(parseNseDate(null)).toBeNull();
    expect(parseNseDate("28-Xxx-2026")).toBeNull();
  });
});

describe("market hours fallback", () => {
  it("reads IST minutes regardless of host timezone", () => {
    expect(istMinutesOfDay(new Date("2026-08-27T04:00:00Z"))).toBe(9 * 60 + 30);
  });

  it("opens inside the session on a weekday", () => {
    // 2026-08-27 is a Thursday. 04:00Z = 09:30 IST.
    expect(isLikelyMarketOpen(new Date("2026-08-27T04:00:00Z"))).toBe(true);
    expect(isLikelyMarketOpen(new Date("2026-08-27T03:30:00Z"))).toBe(false);
    expect(isLikelyMarketOpen(new Date("2026-08-27T10:30:00Z"))).toBe(false);
  });

  it("stays shut at the weekend", () => {
    // 2026-08-29 is a Saturday.
    expect(isLikelyMarketOpen(new Date("2026-08-29T05:00:00Z"))).toBe(false);
  });
});
