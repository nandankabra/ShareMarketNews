import { describe, expect, it } from "vitest";

import { isWatchlistOnly, scoreNotice, type NoticeInput } from "@/lib/notice/score";

const TODAY = "2026-08-27";
const TOMORROW = "2026-08-28";
const DAY_AFTER = "2026-08-29";

const base: NoticeInput = {
  symbol: "TEST",
  events: [],
  newsCount24h: 0,
  newsCount48h: 0,
  dayChangePercent: null,
  avgAbsChangePercent20d: null,
  volume: null,
  avgVolume20d: null,
  inWatchlist: false,
};

const score = (patch: Partial<NoticeInput>) =>
  scoreNotice({ ...base, ...patch }, TODAY, TOMORROW, DAY_AFTER);

describe("dated events", () => {
  it("scores today above tomorrow above the day after", () => {
    const today = score({ events: [{ type: "BOARD_MEETING", eventDate: TODAY, description: "" }] });
    const tomorrow = score({ events: [{ type: "BOARD_MEETING", eventDate: TOMORROW, description: "" }] });
    const later = score({ events: [{ type: "BOARD_MEETING", eventDate: DAY_AFTER, description: "" }] });

    expect(today.score).toBeGreaterThan(tomorrow.score);
    expect(tomorrow.score).toBeGreaterThan(later.score);
    expect(today.eventDriven).toBe(true);
  });

  it("ignores an event outside the window entirely", () => {
    const result = score({ events: [{ type: "EARNINGS", eventDate: "2026-10-09", description: "" }] });
    expect(result.score).toBe(0);
    expect(result.eventDriven).toBe(false);
  });

  it("counts only the nearest event, not one per meeting", () => {
    // Three board meetings this week is one reason to look, not three.
    const result = score({
      events: [
        { type: "BOARD_MEETING", eventDate: TODAY, description: "" },
        { type: "BOARD_MEETING", eventDate: TOMORROW, description: "" },
        { type: "BOARD_MEETING", eventDate: DAY_AFTER, description: "" },
      ],
    });
    expect(result.reasons.filter((reason) => reason.code.startsWith("EVENT_")).length).toBeLessThanOrEqual(2);
    expect(result.score).toBeLessThan(100);
  });

  it("adds an ex-date on its own account", () => {
    const withEx = score({ events: [{ type: "DIVIDEND", eventDate: TODAY, description: "" }] });
    expect(withEx.reasons.some((reason) => reason.code === "EX_DATE_NEAR")).toBe(true);
    expect(withEx.band).toBe("HIGH");
  });
});

describe("news", () => {
  it("caps 24h news so one syndicated story cannot dominate", () => {
    // A single big story becomes fifteen copies within the hour. Uncapped,
    // coverage volume alone would outrank a scheduled earnings call.
    const many = score({ newsCount24h: 15 });
    const earnings = score({ events: [{ type: "EARNINGS", eventDate: TOMORROW, description: "" }] });
    expect(many.score).toBeLessThan(earnings.score);
  });

  it("caps the 24-48h band lower still", () => {
    expect(score({ newsCount48h: 50 }).score).toBe(9);
  });
});

describe("movement", () => {
  it("skips the rule entirely without a baseline", () => {
    // Defaulting a baseline would flag every newly added share on day one.
    const result = score({ dayChangePercent: -9, avgAbsChangePercent20d: null });
    expect(result.reasons.some((reason) => reason.code === "ABNORMAL_MOVE")).toBe(false);
  });

  it("takes the max of its tiers rather than summing them", () => {
    const result = score({ dayChangePercent: 9, avgAbsChangePercent20d: 1.5 });
    const moves = result.reasons.filter((reason) => reason.code === "ABNORMAL_MOVE");
    expect(moves).toHaveLength(1);
    expect(moves[0].points).toBe(30);
  });

  it("reads a fall as abnormal just like a rise", () => {
    const up = score({ dayChangePercent: 4, avgAbsChangePercent20d: 1.5 });
    const down = score({ dayChangePercent: -4, avgAbsChangePercent20d: 1.5 });
    expect(up.score).toBe(down.score);
  });

  it("scores a volume spike", () => {
    expect(score({ volume: 3_000_000, avgVolume20d: 1_000_000 }).score).toBe(10);
  });
});

describe("bands and reasons", () => {
  it("puts a same-day earnings call in HIGH", () => {
    const result = score({ events: [{ type: "EARNINGS", eventDate: TODAY, description: "" }] });
    expect(result.band).toBe("HIGH");
  });

  it("excludes a quiet share", () => {
    expect(score({}).band).toBe("LOW");
  });

  it("never leaves a scoring share without a reason to show", () => {
    const result = score({ newsCount24h: 3, dayChangePercent: 5, avgAbsChangePercent20d: 1.5 });
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.every((reason) => reason.label.length > 0)).toBe(true);
  });

  it("orders reasons by weight so the headline one leads", () => {
    const result = score({
      events: [{ type: "EARNINGS", eventDate: TODAY, description: "" }],
      newsCount24h: 1,
      inWatchlist: true,
    });
    for (let i = 1; i < result.reasons.length; i++) {
      expect(result.reasons[i - 1].points).toBeGreaterThanOrEqual(result.reasons[i].points);
    }
  });

  it("separates a share that only qualifies by being watched", () => {
    // Otherwise the briefing fills up with shares that are doing nothing.
    expect(isWatchlistOnly(score({ inWatchlist: true }))).toBe(true);
    expect(isWatchlistOnly(score({ inWatchlist: true, newsCount24h: 2 }))).toBe(false);
  });
});
