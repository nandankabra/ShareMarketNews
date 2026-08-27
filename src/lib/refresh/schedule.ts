import type { SourceKey } from "@/lib/db/enums";
import { istMinutesOfDay, istWeekday } from "@/lib/date/ist";

/**
 * Which tasks are due on this tick.
 *
 * Pure on purpose — it takes the clock, the market state and the bookkeeping
 * rows as arguments and returns a list. That makes the entire cadence testable
 * against a frozen clock, which is the only practical way to be confident that
 * a task scheduled for 16:15 IST fires once rather than on all ten ticks
 * inside its window.
 */
export type TaskName =
  | "marketStatus"
  | "sectorLevels"
  | "sectorConstituents"
  | "corporateEvents"
  | "optionChain"
  | "quotes"
  | "news"
  | "prune";

export type FetchRow = {
  source: SourceKey;
  lastSuccessAt: Date | null;
  nextEligibleAt: Date | null;
};

const MINUTE = 60_000;

/** Cadence in minutes by market state. `null` means "not on this schedule". */
const CADENCE: Record<TaskName, { source: SourceKey; open: number | null; closed: number | null }> = {
  marketStatus: { source: "NSE_MARKET_STATUS", open: 5, closed: 30 },
  sectorLevels: { source: "NSE_ALL_INDICES", open: 5, closed: null },
  optionChain: { source: "NSE_OPTION_CHAIN", open: 15, closed: null },
  quotes: { source: "YAHOO_QUOTES", open: 1, closed: 30 },
  news: { source: "GOOGLE_NEWS", open: 60, closed: 360 },
  sectorConstituents: { source: "NIFTY_CONSTITUENTS", open: null, closed: null },
  corporateEvents: { source: "NSE_EVENT_CALENDAR", open: null, closed: null },
  prune: { source: "GOOGLE_NEWS", open: null, closed: null },
};

/** Tasks pinned to a time of day rather than an interval, in IST minutes. */
const DAILY_WINDOWS: Partial<Record<TaskName, number[]>> = {
  sectorConstituents: [8 * 60],
  corporateEvents: [8 * 60 + 15, 12 * 60 + 30, 18 * 60],
  prune: [3 * 60],
};

/** A tick is 60s, so ten minutes is a forgiving window to land in. */
const WINDOW_MINUTES = 10;

export function dueTasks(now: Date, marketOpen: boolean, rows: FetchRow[]): TaskName[] {
  const bySource = new Map(rows.map((row) => [row.source, row]));
  const minutes = istMinutesOfDay(now);
  const weekday = istWeekday(now);
  const isWeekend = weekday === 0 || weekday === 6;
  const due: TaskName[] = [];

  for (const name of Object.keys(CADENCE) as TaskName[]) {
    const spec = CADENCE[name];
    const row = bySource.get(spec.source);

    // The backoff gate is shared with the manual refresh button, so a wedged
    // upstream is not hammered from either direction.
    if (row?.nextEligibleAt && row.nextEligibleAt > now) continue;

    const windows = DAILY_WINDOWS[name];
    if (windows) {
      // At the weekend only pruning is worth doing — nothing else has changed.
      if (isWeekend && name !== "prune") continue;

      const inWindow = windows.some((start) => minutes >= start && minutes < start + WINDOW_MINUTES);
      if (!inWindow) continue;

      // Fire once per window, not once per tick inside it.
      if (row?.lastSuccessAt && now.getTime() - row.lastSuccessAt.getTime() < WINDOW_MINUTES * MINUTE) {
        continue;
      }

      due.push(name);
      continue;
    }

    const cadence = marketOpen ? spec.open : spec.closed;
    if (cadence == null) continue;

    // Never run: no success recorded yet means this is a cold start.
    if (!row?.lastSuccessAt) {
      due.push(name);
      continue;
    }

    if (now.getTime() - row.lastSuccessAt.getTime() >= cadence * MINUTE) due.push(name);
  }

  return due;
}

/** Exposed so /health can explain the schedule rather than merely assert it. */
export function cadenceTable(): typeof CADENCE {
  return CADENCE;
}
