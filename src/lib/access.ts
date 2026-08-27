/**
 * A single shared password, not accounts.
 *
 * The panel was designed for one person and has no user model, but a deployed
 * URL is reachable by anyone who finds it — and the app has mutating server
 * actions (edit the watchlist, trigger a refresh) that are perfectly happy to
 * be called by a stranger. Triggering refreshes from outside would also drive
 * traffic at the upstreams from your deployment, which is the opposite of what
 * the whole politeness layer exists to guarantee.
 *
 * So: one password, one cookie, no database. Set ACCESS_PASSWORD to switch it
 * on. Leave it unset and the gate is off entirely, which is what you want on
 * localhost.
 *
 * Web Crypto rather than node:crypto because this runs in the proxy, which is
 * an edge runtime and has no node builtins.
 */
export const ACCESS_COOKIE = "wd_access";

/**
 * The cookie value is a hash of the password, so the password itself never
 * sits in a cookie. This is not a session system — it does not expire
 * server-side and cannot be revoked without changing the password. For a
 * personal panel behind an unguessable URL that is the right amount of
 * machinery; anything more would be pretending.
 */
export async function accessToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`watch-desk:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent comparison, so a wrong guess leaks no timing signal. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isGateEnabled(password: string | undefined): password is string {
  return typeof password === "string" && password.length > 0;
}
