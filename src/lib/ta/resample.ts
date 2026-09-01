import { getISOWeek, getISOWeekYear } from "date-fns";

import type { Candle } from "./types";

/**
 * Daily bars folded into weekly ones, grouped by ISO week rather than a fixed
 * 5-bar stride — a market holiday would otherwise drift the grouping out of
 * calendar alignment within a couple of months.
 */
export function toWeekly(candles: Candle[]): Candle[] {
  const weeks: Candle[] = [];
  let currentKey: string | null = null;

  for (const candle of candles) {
    const date = new Date(candle.t);
    const key = `${getISOWeekYear(date)}-${getISOWeek(date)}`;

    if (key !== currentKey) {
      weeks.push({ ...candle });
      currentKey = key;
      continue;
    }

    const week = weeks[weeks.length - 1];
    week.h = Math.max(week.h, candle.h);
    week.l = Math.min(week.l, candle.l);
    week.c = candle.c;
    week.t = candle.t;
    if (week.v != null && candle.v != null) week.v += candle.v;
    else if (candle.v != null) week.v = candle.v;
  }

  return weeks;
}
