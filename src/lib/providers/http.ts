import { env } from "@/env";
import type { SourceKey } from "@/lib/db/enums";

import { circuitRemaining, openCircuit } from "./circuit";
import { ProviderError } from "./errors";
import { scheduleForHost } from "./rate-limit";

/**
 * One identity, honestly declared.
 *
 * A desktop Chrome User-Agent is not optional — NSE and Yahoo both refuse a
 * bare Node fetch outright. The rejected alternative is worth naming: rotating
 * User-Agents so one client looks like many is how you evade a rate limit
 * rather than respect it, and this app does not do that. One string, one
 * client, one queue per host.
 */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type PoliteResponse = {
  status: number;
  headers: Headers;
  text: string;
};

export type PoliteOptions = {
  source: SourceKey;
  referer?: string;
  accept?: string;
  cookie?: string;
  /** Retries for transport failures only. Shape failures are never retried. */
  retries?: number;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fetch a URL and read its body under a hard wall-clock deadline.
 *
 * `AbortSignal.timeout()` alone is not enough, and this was measured rather
 * than assumed: NSE's near-expiry option chain (a 224KB body) trickled for
 * **913 seconds** before the 12-second signal finally fired, while the next
 * expiry returned in 2.1s. The signal covers the request, but a body that
 * arrives slowly enough can outlive it.
 *
 * So the deadline is enforced twice — an AbortController we fire ourselves, and
 * a race that rejects even if the abort is ignored. Belt and braces, because
 * the failure mode is a hung poller rather than a slow one.
 */
async function fetchWithDeadline(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ status: number; headers: Headers; text: string }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const text = await response.text();
        return { status: response.status, headers: response.headers, text };
      })(),
      deadline,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Backoff for the permitted retries. */
const RETRY_DELAYS_MS = [1_000, 5_000];

/**
 * A hard ceiling on how long one logical request may spend, retries included.
 *
 * Learned the expensive way: with per-attempt sleeps and a host queue in front,
 * a throttled host turned a single call into sixteen minutes of retrying. A
 * request that cannot be served in half a minute has failed, and the task above
 * it should record that and move on rather than hold the tick hostage.
 */
const TOTAL_BUDGET_MS = 30_000;

export async function politeFetch(url: string, options: PoliteOptions): Promise<PoliteResponse> {
  const host = new URL(url).host;
  const maxRetries = options.retries ?? 2;
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  // A host that recently told us to back off is left alone entirely. This is
  // the difference between respecting a 429 and merely surviving one.
  const cooling = circuitRemaining(host);
  if (cooling > 0) {
    throw new ProviderError({
      kind: "BLOCKED",
      source: options.source,
      message: `${host} asked us to back off — ${Math.ceil(cooling / 1000)}s remaining`,
    });
  }

  let lastError: ProviderError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
      if (Date.now() + delay > deadline) break;
      await sleep(delay);
    }

    try {
      return await scheduleForHost(host, async () => {
        const headers: Record<string, string> = {
          "User-Agent": USER_AGENT,
          "Accept-Language": "en-IN,en;q=0.9",
          "Accept": options.accept ?? "*/*",
        };
        if (options.referer) headers["Referer"] = options.referer;
        if (options.cookie) headers["Cookie"] = options.cookie;

        const response = await fetchWithDeadline(
          url,
          { headers, redirect: "follow", cache: "no-store" },
          env.FETCH_TIMEOUT_MS,
        );

        const text = response.text;

        // 5xx and 429 are the server asking us to come back later — the one
        // case where trying again is the right move rather than rudeness.
        if (response.status === 429) {
          // Stop calling this host at all for a while. Retrying a throttle is
          // how a soft limit becomes a hard one, so a 429 is treated as
          // BLOCKED — not retryable — and the circuit does the waiting.
          const retryAfter = Number(response.headers.get("retry-after"));
          const cooldown = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 15 * 60_000)
            : undefined;
          openCircuit(host, cooldown);
          throw new ProviderError({
            kind: "BLOCKED",
            source: options.source,
            status: 429,
            message: `${host} rate limited us — backing off`,
          });
        }

        if (response.status >= 500) {
          throw new ProviderError({
            kind: "NETWORK",
            source: options.source,
            status: response.status,
            message: `${host} answered ${response.status}`,
          });
        }

        if (response.status === 401 || response.status === 403) {
          throw new ProviderError({
            kind: "BLOCKED",
            source: options.source,
            status: response.status,
            message: `${host} refused the request (${response.status})`,
          });
        }

        return { status: response.status, headers: response.headers, text };
      });
    } catch (error) {
      const providerError =
        error instanceof ProviderError
          ? error
          : new ProviderError({
              kind: "NETWORK",
              source: options.source,
              message: error instanceof Error ? error.message : String(error),
            });

      lastError = providerError;
      if (!providerError.retryable) throw providerError;
      if (Date.now() >= deadline) break;
    }
  }

  throw lastError ?? new ProviderError({
    kind: "NETWORK",
    source: options.source,
    message: `${host} did not answer`,
  });
}

export { USER_AGENT };
