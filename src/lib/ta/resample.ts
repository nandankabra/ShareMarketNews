import { getISOWeek, getISOWeekYear } from "date-fns";

import type { Candle } from "./types";

/** Folds consecutive daily bars into one bar per period, as `keyOf` names periods. */
function fold(candles: Candle[], keyOf: (date: Date) => string): Candle[] {
  const out: Candle[] = [];
  let currentKey: string | null = null;

  for (const candle of candles) {
    const key = keyOf(new Date(candle.t));

    if (key !== currentKey) {
      out.push({ ...candle });
      currentKey = key;
      continue;
    }

    const bar = out[out.length - 1];
    bar.h = Math.max(bar.h, candle.h);
    bar.l = Math.min(bar.l, candle.l);
    bar.c = candle.c;
    bar.t = candle.t;
    if (bar.v != null && candle.v != null) bar.v += candle.v;
    else if (candle.v != null) bar.v = candle.v;
  }

  return out;
}

/**
 * Daily bars folded into weekly ones, grouped by ISO week rather than a fixed
 * 5-bar stride — a market holiday would otherwise drift the grouping out of
 * calendar alignment within a couple of months.
 */
export function toWeekly(candles: Candle[]): Candle[] {
  return fold(candles, (date) => `${getISOWeekYear(date)}-${getISOWeek(date)}`);
}

/**
 * Daily bars folded into calendar months. The newest month is a partial bar —
 * that is what makes it useful mid-month, and why the monthly trend leans on
 * an average rather than on that last bar alone.
 */
export function toMonthly(candles: Candle[]): Candle[] {
  return fold(candles, (date) => `${date.getFullYear()}-${date.getMonth()}`);
}
