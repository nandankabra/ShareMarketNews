import "server-only";

/**
 * The instant a request is being rendered at.
 *
 * Async, and reached through the data layer rather than called inline in a
 * component, for two reasons. Reading the clock during render makes a
 * component a non-pure function of its props — React's compiler lint flags it,
 * and it is right to. And practically, every relative time on a page should
 * measure from the same instant: without one shared `now`, a table of twenty
 * rows can render "2m ago" and "3m ago" for two identical timestamps.
 */
export async function serverNow(): Promise<number> {
  return Date.now();
}
