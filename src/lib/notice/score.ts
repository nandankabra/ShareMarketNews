import type { CorporateEventType } from "@/lib/db/enums";

/**
 * The rule that decides what to keep an eye on today and tomorrow.
 *
 * Pure by construction: no prisma, no env, no clock. `today` arrives as a
 * parameter so the whole thing is table-testable against a frozen date, and so
 * that "today" always means the IST day the caller resolved rather than
 * whatever the server's timezone thinks.
 *
 * Every rule that fires appends a human-readable reason. The score itself is
 * never shown on screen — it exists to order the list, and the reasons are
 * what the reader actually gets.
 */

export type NoticeReasonCode =
  | "EVENT_TODAY"
  | "EVENT_TOMORROW"
  | "EVENT_SOON"
  | "EVENT_KIND"
  | "EX_DATE_NEAR"
  | "NEWS_24H"
  | "NEWS_48H"
  | "ABNORMAL_MOVE"
  | "VOLUME_SPIKE"
  | "IN_WATCHLIST";

export type NoticeReason = { code: NoticeReasonCode; label: string; points: number };

export type NoticeBand = "HIGH" | "MEDIUM" | "LOW";

export type NoticeEvent = {
  type: CorporateEventType;
  eventDate: string;
  recordDate?: string | null;
  description: string;
};

export type NoticeInput = {
  symbol: string;
  events: NoticeEvent[];
  newsCount24h: number;
  newsCount48h: number;
  dayChangePercent: number | null;
  avgAbsChangePercent20d: number | null;
  volume: number | null;
  avgVolume20d: number | null;
  inWatchlist: boolean;
};

export type NoticeResult = {
  symbol: string;
  score: number;
  band: NoticeBand;
  reasons: NoticeReason[];
  /** True when any points came from a dated corporate event. */
  eventDriven: boolean;
};

const HIGH_THRESHOLD = 60;
const MEDIUM_THRESHOLD = 30;

/** One big story syndicates into a dozen copies within the hour. */
const NEWS_24H_CAP = 24;
const NEWS_48H_CAP = 9;

const EARNINGS_KINDS: ReadonlySet<CorporateEventType> = new Set(["EARNINGS", "BOARD_MEETING"]);
const PAYOUT_KINDS: ReadonlySet<CorporateEventType> = new Set(["DIVIDEND", "SPLIT", "BONUS"]);

export function scoreNotice(input: NoticeInput, today: string, tomorrow: string, dayAfter: string): NoticeResult {
  const reasons: NoticeReason[] = [];
  let eventDriven = false;

  const add = (code: NoticeReasonCode, label: string, points: number) => {
    if (points === 0) return;
    reasons.push({ code, label, points });
  };

  // --- Dated corporate events ------------------------------------------
  // Only the nearest event scores: three board meetings this week is one reason
  // to look, not three. Chosen before anything is added to `reasons`, so this
  // block never has to reach back in and remove an entry it already wrote.
  let best: { points: number; code: NoticeReasonCode; label: string; event: NoticeEvent } | null = null;

  for (const event of input.events) {
    let points = 0;
    let code: NoticeReasonCode = "EVENT_SOON";
    let label = "";

    if (event.eventDate === today) {
      points = 50;
      code = "EVENT_TODAY";
      label = `${describeType(event.type)} today`;
    } else if (event.eventDate === tomorrow) {
      points = 40;
      code = "EVENT_TOMORROW";
      label = `${describeType(event.type)} tomorrow`;
    } else if (event.eventDate === dayAfter) {
      points = 15;
      code = "EVENT_SOON";
      label = `${describeType(event.type)} in two days`;
    }

    if (points > (best?.points ?? 0)) best = { points, code, label, event };
  }

  const bestEvent = best?.event ?? null;
  const bestEventPoints = best?.points ?? 0;
  if (best) add(best.code, best.label, best.points);

  if (bestEvent && bestEventPoints > 0) {
    eventDriven = true;
    if (EARNINGS_KINDS.has(bestEvent.type)) {
      add("EVENT_KIND", "Earnings or a board meeting", 10);
    } else if (PAYOUT_KINDS.has(bestEvent.type)) {
      add("EVENT_KIND", "Dividend, split or bonus", 5);
    }
  }

  // An ex-date is what actually costs a holder the entitlement, so it scores
  // on its own account rather than only as an event kind.
  const exDateNear = input.events.some(
    (event) => PAYOUT_KINDS.has(event.type) && (event.eventDate === today || event.eventDate === tomorrow),
  );
  if (exDateNear) {
    eventDriven = true;
    add("EX_DATE_NEAR", "Ex-date today or tomorrow", 35);
  }

  // --- News ------------------------------------------------------------
  if (input.newsCount24h > 0) {
    const points = Math.min(input.newsCount24h * 8, NEWS_24H_CAP);
    add("NEWS_24H", `${input.newsCount24h} ${plural(input.newsCount24h, "story", "stories")} in 24h`, points);
  }
  if (input.newsCount48h > 0) {
    const points = Math.min(input.newsCount48h * 3, NEWS_48H_CAP);
    add("NEWS_48H", `${input.newsCount48h} more in the previous day`, points);
  }

  // --- Movement --------------------------------------------------------
  // Skipped entirely when there is no baseline. Defaulting one would flag
  // every newly added share on its first day.
  if (input.dayChangePercent != null && input.avgAbsChangePercent20d && input.avgAbsChangePercent20d > 0) {
    const multiple = Math.abs(input.dayChangePercent) / input.avgAbsChangePercent20d;
    // Max of the two tiers, not a sum: one signal contributes one number.
    if (multiple >= 3) {
      add("ABNORMAL_MOVE", `Moved ${multiple.toFixed(1)}× its usual swing`, 30);
    } else if (multiple >= 2) {
      add("ABNORMAL_MOVE", `Moved ${multiple.toFixed(1)}× its usual swing`, 20);
    }
  }

  if (input.volume != null && input.avgVolume20d && input.avgVolume20d > 0) {
    const multiple = input.volume / input.avgVolume20d;
    if (multiple >= 2) add("VOLUME_SPIKE", `Volume ${multiple.toFixed(1)}× average`, 10);
  }

  if (input.inWatchlist) add("IN_WATCHLIST", "On your watchlist", 15);

  const score = reasons.reduce((total, reason) => total + reason.points, 0);

  return {
    symbol: input.symbol,
    score,
    band: score >= HIGH_THRESHOLD ? "HIGH" : score >= MEDIUM_THRESHOLD ? "MEDIUM" : "LOW",
    reasons: reasons.sort((a, b) => b.points - a.points),
    eventDriven,
  };
}

/**
 * A share whose only reason is being on the watchlist belongs in its own
 * section, not in "needs attention" — otherwise the briefing fills up with
 * shares that are doing nothing.
 */
export function isWatchlistOnly(result: NoticeResult): boolean {
  return result.reasons.every((reason) => reason.code === "IN_WATCHLIST");
}

function describeType(type: CorporateEventType): string {
  switch (type) {
    case "EARNINGS": return "Results";
    case "BOARD_MEETING": return "Board meeting";
    case "DIVIDEND": return "Dividend ex-date";
    case "BONUS": return "Bonus";
    case "SPLIT": return "Stock split";
    case "RIGHTS": return "Rights issue";
    case "BUYBACK": return "Buyback";
    case "AGM": return "AGM";
    default: return "Corporate event";
  }
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}
