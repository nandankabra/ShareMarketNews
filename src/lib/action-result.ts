/**
 * The shape every server action returns.
 *
 * Actions report failure rather than throwing it. A thrown error in a server
 * action reaches the client as an opaque digest with the message stripped in
 * production, which is useless to the person who just clicked the button — so
 * anything a user could plausibly cause comes back as a `failure` with words
 * they can act on. Genuine bugs are still allowed to throw.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function success(): ActionResult<void>;
export function success<T>(data: T): ActionResult<T>;
export function success<T>(data?: T): ActionResult<T | void> {
  return { ok: true, data: data as T };
}

export function failure<T = void>(error: string): ActionResult<T> {
  return { ok: false, error };
}
