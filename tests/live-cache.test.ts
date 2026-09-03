import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `liveSource` composes two `unstable_cache` entries — a long one for successes
 * and a short one consulted only when the long one is holding a failure. What
 * is worth testing is that composition, not Next's cache implementation, so
 * `unstable_cache` is replaced with a minimal TTL cache. Both it and the code
 * under test read `Date.now()`, so a fake system clock drives the two together
 * — `liveSource` compares a failure's own timestamp against the current time,
 * and the two must not be on different clocks. Keying matches Next's documented
 * behaviour: the key parts plus the stringified arguments.
 */
vi.useFakeTimers();

/** Move both the cache and `liveSource`'s staleness check forward together. */
function advance(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

vi.mock("next/cache", () => ({
  unstable_cache: <A extends readonly unknown[], T>(
    fn: (...args: A) => Promise<T>,
    keyParts: string[],
    options: { revalidate: number },
  ) => {
    const entries = new Map<string, { value: T; storedAt: number }>();
    return async (...args: A): Promise<T> => {
      const key = `${JSON.stringify(keyParts)}:${JSON.stringify(args)}`;
      const hit = entries.get(key);
      if (hit && Date.now() - hit.storedAt < options.revalidate * 1000) return hit.value;
      const value = await fn(...args);
      entries.set(key, { value, storedAt: Date.now() });
      return value;
    };
  },
}));

const { liveSource } = await import("@/lib/live/cache");

/** The option chain's window: the one that used to strand a failure for 5 minutes. */
const SUCCESS_TTL = 300;

beforeEach(() => {
  vi.setSystemTime(new Date("2026-09-03T09:00:00Z"));
});

afterAll(() => {
  vi.useRealTimers();
});

describe("liveSource", () => {
  it("calls the upstream once per success window, however many readers", async () => {
    const upstream = vi.fn(async () => "chain");
    const read = liveSource("option-chain", upstream, SUCCESS_TTL);

    for (let i = 0; i < 5; i++) expect(await read()).toMatchObject({ ok: true, data: "chain" });
    expect(upstream).toHaveBeenCalledTimes(1);

    advance(299_000);
    await read();
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("turns a throw into a failure rather than propagating it", async () => {
    const read = liveSource("option-chain", async () => {
      throw new Error("login page, not a chain");
    }, SUCCESS_TTL);

    expect(await read()).toMatchObject({ ok: false, error: "login page, not a chain" });
  });

  it("does not re-hit an upstream that is already failing", async () => {
    const upstream = vi.fn(async () => {
      throw new Error("nope");
    });
    const read = liveSource("option-chain", upstream, SUCCESS_TTL);

    // Twenty readers inside the failure window must not become twenty calls:
    // that stampede is the whole reason failures are cached at all.
    for (let i = 0; i < 20; i++) await read();
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("retries a cached failure after the failure window, not the success window", async () => {
    let failing = true;
    const upstream = vi.fn(async () => {
      if (failing) throw new Error("cold start");
      return "chain";
    });
    const read = liveSource("option-chain", upstream, SUCCESS_TTL);

    expect(await read()).toMatchObject({ ok: false });
    failing = false;

    // Still inside the 30s failure window: the stale failure stands.
    advance(29_000);
    expect(await read()).toMatchObject({ ok: false });

    // Past it, and long before the 300s success window would have expired.
    advance(2_000);
    expect(await read()).toMatchObject({ ok: true, data: "chain" });
  });

  it("keeps serving a recovered value while the long entry still holds the failure", async () => {
    let failing = true;
    const upstream = vi.fn(async () => {
      if (failing) throw new Error("cold start");
      return "chain";
    });
    const read = liveSource("option-chain", upstream, SUCCESS_TTL);

    await read();
    failing = false;
    advance(31_000);
    expect(await read()).toMatchObject({ ok: true });

    // The long entry is still failed for another four minutes, but readers in
    // that stretch get the recovered value off the short entry rather than the
    // stale failure — and it costs one upstream call per failure window.
    const before = upstream.mock.calls.length;
    advance(5_000);
    expect(await read()).toMatchObject({ ok: true, data: "chain" });
    expect(upstream).toHaveBeenCalledTimes(before);
  });

  it("never retries more often than the success window for short-lived sources", async () => {
    // A 20s quote already refreshes faster than the 30s failure window; the
    // retry entry must not make it hit the upstream more often than that.
    const upstream = vi.fn(async () => {
      throw new Error("nope");
    });
    const read = liveSource("quote", upstream, 20);

    await read();
    advance(19_000);
    await read();
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("keys separate arguments separately", async () => {
    const upstream = vi.fn(async (symbol: string) => `chain:${symbol}`);
    const read = liveSource("option-chain", upstream, SUCCESS_TTL);

    expect(await read("NIFTY")).toMatchObject({ data: "chain:NIFTY" });
    expect(await read("BANKNIFTY")).toMatchObject({ data: "chain:BANKNIFTY" });
    expect(upstream).toHaveBeenCalledTimes(2);
  });
});
