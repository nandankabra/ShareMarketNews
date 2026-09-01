import { describe, expect, it } from "vitest";

import { toWeekly } from "@/lib/ta/resample";
import type { Candle } from "@/lib/ta/types";

const DAY = 86_400_000;

/** Five weekdays per week starting Monday 2026-01-05, no holidays. */
function weekdays(count: number): Candle[] {
  const out: Candle[] = [];
  let t = Date.UTC(2026, 0, 5); // a Monday
  let close = 100;
  while (out.length < count) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) {
      out.push({ t, o: close, h: close + 2, l: close - 2, c: close, v: 1_000 });
      close += 1;
    }
    t += DAY;
  }
  return out;
}

describe("toWeekly", () => {
  it("folds five daily bars into one weekly bar", () => {
    const weekly = toWeekly(weekdays(5));
    expect(weekly).toHaveLength(1);
    expect(weekly[0].o).toBe(100);
    expect(weekly[0].c).toBe(104);
    expect(weekly[0].h).toBe(106);
    expect(weekly[0].l).toBe(98);
    expect(weekly[0].v).toBe(5_000);
  });

  it("starts a new bar when the ISO week changes", () => {
    const weekly = toWeekly(weekdays(10));
    expect(weekly).toHaveLength(2);
    expect(weekly[1].o).toBe(105);
  });

  it("carries the last bar's timestamp, not the first", () => {
    const daily = weekdays(5);
    const weekly = toWeekly(daily);
    expect(weekly[0].t).toBe(daily[4].t);
  });

  it("returns nothing for no candles", () => {
    expect(toWeekly([])).toEqual([]);
  });
});
