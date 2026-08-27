/**
 * IST date helpers.
 *
 * A fixed +05:30 offset, not a timezone database: India has no daylight saving,
 * so the offset is exactly correct all year and pulling in date-fns-tz for one
 * constant would be waste.
 *
 * This module matters more than its size suggests. A server running in UTC
 * flips "today" at 18:30 IST — three hours after the market closes — so a naive
 * `new Date().toISOString().slice(0, 10)` silently drops that evening's
 * briefing. Every calendar date in the app goes through here.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The wall-clock time in India, expressed as a Date whose UTC fields read IST. */
function toIstFields(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

/** "YYYY-MM-DD" for the IST calendar day containing `date`. */
export function istDayKey(date: Date = new Date()): string {
  const ist = toIstFields(date);
  const year = ist.getUTCFullYear();
  const month = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const day = String(ist.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function istToday(now: Date = new Date()): string {
  return istDayKey(now);
}

/** Shift a day key by whole days. Works on the key, so it cannot drift. */
export function addDaysIst(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const base = Date.UTC(year, month - 1, day);
  return istDayKey(new Date(base + days * 86_400_000 - IST_OFFSET_MS));
}

/** Minutes since IST midnight — used for market-hours and schedule windows. */
export function istMinutesOfDay(date: Date = new Date()): number {
  const ist = toIstFields(date);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/** 0 = Sunday. IST weekday. */
export function istWeekday(date: Date = new Date()): number {
  return toIstFields(date).getUTCDay();
}

/**
 * Fallback market-hours check, used only when NSE's own status endpoint has
 * failed. Mon-Fri, 09:15-15:30 IST. It knows nothing about trading holidays,
 * which is exactly why it is the fallback and why /health says when it is in
 * use.
 */
export function isLikelyMarketOpen(date: Date = new Date()): boolean {
  const weekday = istWeekday(date);
  if (weekday === 0 || weekday === 6) return false;
  const minutes = istMinutesOfDay(date);
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}

const NSE_MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/**
 * Parse NSE's "28-Aug-2026" into a day key. Returns null rather than throwing:
 * these fields are free text upstream and a single malformed row should not
 * fail a sync of two hundred good ones.
 */
export function parseNseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const month = NSE_MONTHS[match[2][0].toUpperCase() + match[2].slice(1, 3).toLowerCase()];
  if (!month) return null;
  const day = Number(match[1]);
  if (day < 1 || day > 31) return null;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** A day key back to a Date at IST midnight, for storing DAILY bars. */
export function dayKeyToDate(dayKey: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

/** Whole days between two day keys (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((dayKeyToDate(b).getTime() - dayKeyToDate(a).getTime()) / 86_400_000);
}
