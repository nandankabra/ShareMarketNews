import "server-only";

import { cookies } from "next/headers";

import { ACCESS_COOKIE, accessToken, isGateEnabled, safeEqual } from "@/lib/access";

/**
 * Re-check the gate inside every mutating action.
 *
 * The proxy already redirects unauthenticated page loads, but Next's own docs
 * are explicit that a proxy is an optimistic check rather than an authorization
 * layer — and server actions are POSTs to a page URL, reachable by anyone who
 * can construct the request. A matcher is also easy to get subtly wrong. So the
 * actions that change something verify for themselves; read paths rely on the
 * proxy, since the worst case there is someone seeing public market data.
 */
export type AccessDenied = { ok: false; error: string };

/**
 * Returns the failure branch only, never a success. Typing it that way is what
 * lets a caller `return denied` regardless of its own result type — an
 * ActionResult<void> would not be assignable to ActionResult<{ symbol }>.
 */
export async function requireAccess(): Promise<AccessDenied | null> {
  const password = process.env.ACCESS_PASSWORD;
  if (!isGateEnabled(password)) return null;

  const cookie = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (cookie && safeEqual(cookie, await accessToken(password))) return null;

  return { ok: false, error: "This panel is locked. Reload the page and enter the access password." };
}
