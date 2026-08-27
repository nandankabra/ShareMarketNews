/**
 * A per-host cooldown.
 *
 * When a host answers 429, the polite response is to stop calling it — not to
 * keep retrying with a longer sleep. Without this, one throttled host turns a
 * smoke run into sixteen minutes of backoff, and every one of those retries is
 * the app being exactly as rude as the 429 asked it not to be.
 *
 * The cooldown is process-local and deliberately not persisted: a restart is a
 * reasonable moment to try again, and a stale cooldown on disk would be a
 * confusing thing to debug.
 */
const cooldowns = new Map<string, number>();

/** How long to leave a host alone after it asks us to back off. */
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

export function openCircuit(host: string, ms: number = DEFAULT_COOLDOWN_MS): void {
  cooldowns.set(host, Date.now() + ms);
}

/** Milliseconds remaining, or 0 when the host is free to call. */
export function circuitRemaining(host: string): number {
  const until = cooldowns.get(host);
  if (!until) return 0;
  const remaining = until - Date.now();
  if (remaining <= 0) {
    cooldowns.delete(host);
    return 0;
  }
  return remaining;
}

export function isCircuitOpen(host: string): boolean {
  return circuitRemaining(host) > 0;
}

export function resetCircuits(): void {
  cooldowns.clear();
}

/** For the health page — which hosts are currently being left alone. */
export function openCircuits(): Array<{ host: string; secondsRemaining: number }> {
  const out: Array<{ host: string; secondsRemaining: number }> = [];
  for (const host of cooldowns.keys()) {
    const remaining = circuitRemaining(host);
    if (remaining > 0) out.push({ host, secondsRemaining: Math.ceil(remaining / 1000) });
  }
  return out;
}
