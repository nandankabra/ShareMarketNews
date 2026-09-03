import "server-only";

import { addDaysIst, istToday } from "@/lib/date/ist";
import { upcomingActions, type UpcomingActions } from "@/lib/corporate/upcoming";
import { liveCorporateActions, liveEvents } from "@/lib/live/sources";

export type { UpcomingAction } from "@/lib/corporate/upcoming";

/** How far ahead to look. A week of buybacks is usually none; a month is a few. */
const WINDOW_DAYS = 30;

export type ActionsAhead = UpcomingActions & {
  /** False when the corporate-actions feed did not answer, so the panel can say so. */
  available: boolean;
};

/**
 * Buybacks and dividends scheduled in the next month.
 *
 * Two feeds, read one after the other rather than together: every outbound
 * request goes through one per-host serialized queue and both of these are NSE,
 * so a `Promise.all` here would only queue behind itself while claiming
 * otherwise. Both are cached, and the briefing on the same page has usually
 * warmed the event calendar already, so the marginal cost is the actions call.
 */
export async function getActionsAhead(): Promise<ActionsAhead> {
  const today = istToday();

  const actions = await liveCorporateActions(today, addDaysIst(today, WINDOW_DAYS));
  const events = await liveEvents();

  if (!actions.ok && !events.ok) {
    return { buybacks: [], dividends: [], available: false };
  }

  return {
    ...upcomingActions(
      actions.ok ? actions.data : [],
      events.ok ? events.data : [],
      today,
    ),
    // The actions feed is the one that carries buybacks and amounts; without it
    // the panel is running on board meetings alone and should not imply
    // otherwise.
    available: actions.ok,
  };
}
