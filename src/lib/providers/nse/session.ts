import type { SourceKey } from "@/lib/db/enums";

import { ProviderError, looksLikeHtml } from "../errors";
import { politeFetch } from "../http";

/**
 * NSE's APIs only answer a client that already holds the cookies its website
 * hands out. Node's fetch has no cookie jar, so we keep a tiny one here.
 *
 * Two rules matter and both are about not getting banned:
 *
 * 1. Single-flight. Five callers arriving at once must trigger one handshake,
 *    not five. A burst of bootstraps looks exactly like the thing NSE's bot
 *    defences are built to stop.
 * 2. Re-handshake at most once. On a blocked response we refresh the session
 *    and try again — then give up and let the caller back off for hours. A
 *    retry loop against a bot defence is how an IP ends up on a list.
 */
const BOOTSTRAP_URL = "https://www.nseindia.com/market-data/live-equity-market";
const SESSION_TTL_MS = 10 * 60 * 1000;

type Session = { cookie: string; obtainedAt: number };

let session: Session | null = null;
let inFlight: Promise<Session> | null = null;

function parseSetCookies(headers: Headers): string {
  const jar = new Map<string, string>();
  for (const raw of headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function bootstrap(source: SourceKey): Promise<Session> {
  const response = await politeFetch(BOOTSTRAP_URL, {
    source,
    accept: "text/html,application/xhtml+xml",
    retries: 1,
  });

  const cookie = parseSetCookies(response.headers);
  if (!cookie) {
    throw new ProviderError({
      kind: "BLOCKED",
      source,
      message: "NSE handed out no cookies — the handshake page did not behave like a browser session",
    });
  }

  return { cookie, obtainedAt: Date.now() };
}

async function getSession(source: SourceKey, force = false): Promise<Session> {
  const fresh = session && Date.now() - session.obtainedAt < SESSION_TTL_MS;
  if (fresh && !force) return session!;

  if (!inFlight) {
    inFlight = bootstrap(source)
      .then((next) => {
        session = next;
        return next;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight;
}

/**
 * Fetch an NSE API path with a live session. `referer` must match the page the
 * endpoint belongs to — NSE checks it and refuses a mismatch.
 */
export async function nseApiFetch(
  path: string,
  options: { source: SourceKey; referer: string },
): Promise<string> {
  const url = `https://www.nseindia.com/${path.replace(/^\//, "")}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await getSession(options.source, attempt > 0);

    let body: string;
    try {
      const response = await politeFetch(url, {
        source: options.source,
        referer: options.referer,
        accept: "application/json, text/plain, */*",
        cookie: current.cookie,
        retries: 1,
      });
      body = response.text;
    } catch (error) {
      // A blocked answer on the first pass is usually just an expired session.
      if (error instanceof ProviderError && error.kind === "BLOCKED" && attempt === 0) continue;
      throw error;
    }

    // The tell that matters: a 200 carrying a login page or an interstitial.
    if (looksLikeHtml(body)) {
      if (attempt === 0) continue;
      throw new ProviderError({
        kind: "BLOCKED",
        source: options.source,
        message: `NSE answered ${path} with a web page instead of data`,
        detail: body.slice(0, 200),
      });
    }

    return body;
  }

  throw new ProviderError({
    kind: "BLOCKED",
    source: options.source,
    message: `NSE would not serve ${path} even after a fresh handshake`,
  });
}

/** Drop the cached session. Used by tests and the manual refresh action. */
export function resetNseSession(): void {
  session = null;
}
