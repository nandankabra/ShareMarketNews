import type { CorporateAction } from "@/lib/providers/nse/parse-corporate-actions";
import type { UpcomingEvent } from "@/lib/providers/nse/parse-event-calendar";

/**
 * What is coming up for a share, from the two feeds that know.
 *
 * These describe scheduled corporate actions and nothing else. A dividend or a
 * buyback is a fact about a company's calendar, not a reason to own it, and
 * nothing here ranks, scores or recommends — the order is the date order.
 */
export type UpcomingAction = {
  symbol: string;
  company: string | null;
  /** Day key. For DECLARED this is the ex-date; for EXPECTED, the meeting. */
  date: string;
  /**
   * DECLARED — the company has announced it and NSE has an ex-date.
   * EXPECTED — a board meeting is scheduled to consider it. It may not happen.
   */
  stage: "DECLARED" | "EXPECTED";
  /** Rupees per share, when the description states it. */
  amount: number | null;
  description: string;
};

export type UpcomingActions = {
  buybacks: UpcomingAction[];
  dividends: UpcomingAction[];
};

/**
 * "Dividend - Rs 12.50 Per Share" → 12.5.
 *
 * Both "Rs" and "Re" appear, and the amount is the only number in the string
 * that is followed by "per share" — anchoring on that rather than on the first
 * number keeps a company name containing a digit from being read as a payout.
 */
export function parseDividendAmount(description: string): number | null {
  const match = /\b(?:rs|re)\.?\s*([\d,]+(?:\.\d+)?)\s*\/?-?\s*per\s+share/i.exec(description);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Earliest first, then by symbol so a same-day tie has a stable order. */
function byDateThenSymbol(a: UpcomingAction, b: UpcomingAction): number {
  return a.date === b.date ? a.symbol.localeCompare(b.symbol) : a.date.localeCompare(b.date);
}

/**
 * One row per share, keeping the earliest.
 *
 * A company that has declared a dividend often also has the board meeting that
 * declared it still sitting in the calendar. Listing both would read as two
 * separate dividends, so the declared one wins — it is the more certain fact
 * and it carries the amount.
 */
function firstPerSymbol(actions: UpcomingAction[]): UpcomingAction[] {
  const seen = new Map<string, UpcomingAction>();
  for (const action of [...actions].sort(byDateThenSymbol)) {
    const existing = seen.get(action.symbol);
    if (!existing) {
      seen.set(action.symbol, action);
      continue;
    }
    // Prefer a declared action over an expected one regardless of which is
    // sooner: a scheduled meeting before an ex-date is the same event twice.
    if (existing.stage === "EXPECTED" && action.stage === "DECLARED") seen.set(action.symbol, action);
  }
  return [...seen.values()].sort(byDateThenSymbol);
}

/**
 * Split the two feeds into the buybacks and dividends still ahead.
 *
 * `today` is passed in rather than read from the clock so this stays pure and
 * the boundary is testable — an ex-date of today is still ahead, because the
 * share trades cum-dividend right up to it.
 */
export function upcomingActions(
  actions: CorporateAction[],
  events: UpcomingEvent[],
  today: string,
  limit = 6,
): UpcomingActions {
  const declared = actions
    .filter((action) => action.eventDate >= today)
    .map((action) => ({
      type: action.type,
      action: {
        symbol: action.symbol,
        company: action.company,
        date: action.eventDate,
        stage: "DECLARED" as const,
        amount: parseDividendAmount(action.description),
        description: action.description,
      },
    }));

  // The event calendar is board meetings: a company scheduled to *consider* a
  // dividend has not declared one, and saying otherwise would invent a payout.
  const expected = events
    .filter((event) => event.eventDate >= today)
    .map((event) => ({
      type: event.type,
      action: {
        symbol: event.symbol,
        company: event.company,
        date: event.eventDate,
        stage: "EXPECTED" as const,
        amount: null,
        description: event.description,
      },
    }));

  const ofType = (type: "BUYBACK" | "DIVIDEND") => {
    const rows = firstPerSymbol(
      [...declared, ...expected].filter((row) => row.type === type).map((row) => row.action),
    );
    const certain = rows.filter((row) => row.stage === "DECLARED");
    const scheduled = rows.filter((row) => row.stage === "EXPECTED");

    // Reserve a third of the slots for meetings that have not happened yet.
    //
    // Straight date order does not work here: a single day can carry six
    // dividends going ex, which fills the list before a single scheduled
    // meeting appears — and "who is about to announce one" is a different
    // question from "who goes ex this week", not a less important one.
    const scheduledSlots = Math.min(scheduled.length, Math.floor(limit / 3));
    return [...certain.slice(0, limit - scheduledSlots), ...scheduled.slice(0, scheduledSlots)];
  };

  return { buybacks: ofType("BUYBACK"), dividends: ofType("DIVIDEND") };
}
