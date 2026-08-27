import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_COOKIE, accessToken, isGateEnabled, safeEqual } from "@/lib/access";

/**
 * The access gate.
 *
 * Runs before every page and API route. When ACCESS_PASSWORD is unset the gate
 * is off and this is a no-op, which keeps local development frictionless.
 *
 * Next's own guidance is that a proxy is an optimistic check rather than a
 * full authorization layer — and that holds here, because the same check is
 * repeated inside every mutating server action. A proxy alone would not protect
 * those: server actions are POSTs to the page URL and a matcher is easy to get
 * subtly wrong, so the actions verify for themselves as well.
 */
export async function proxy(request: NextRequest) {
  const password = process.env.ACCESS_PASSWORD;
  if (!isGateEnabled(password)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname === "/unlock") return NextResponse.next();

  const cookie = request.cookies.get(ACCESS_COOKIE)?.value;
  if (cookie && safeEqual(cookie, await accessToken(password))) return NextResponse.next();

  // API routes get a status, not a redirect — a fetch following a 307 to an
  // HTML login page produces a confusing parse error rather than a clear 401.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Everything except Next's own assets and the favicon.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
