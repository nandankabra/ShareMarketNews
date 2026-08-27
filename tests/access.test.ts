import { describe, expect, it } from "vitest";

import { accessToken, isGateEnabled, safeEqual } from "@/lib/access";

describe("accessToken", () => {
  it("is stable for the same password", async () => {
    expect(await accessToken("hunter2")).toBe(await accessToken("hunter2"));
  });

  it("differs for different passwords", async () => {
    expect(await accessToken("hunter2")).not.toBe(await accessToken("hunter3"));
  });

  it("never contains the password itself", async () => {
    // The cookie carries this value, so the password must not be recoverable
    // by reading it.
    const token = await accessToken("swordfish");
    expect(token).not.toContain("swordfish");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("safeEqual", () => {
  it("matches identical strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
  });

  it("rejects a difference at any position", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "zbc")).toBe(false);
  });

  it("rejects different lengths without throwing", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "a")).toBe(false);
  });
});

describe("isGateEnabled", () => {
  it("is off when no password is configured", () => {
    // Local development must stay frictionless — an unset password means no
    // gate at all rather than a locked-out app.
    expect(isGateEnabled(undefined)).toBe(false);
    expect(isGateEnabled("")).toBe(false);
  });

  it("is on for any non-empty password", () => {
    expect(isGateEnabled("x")).toBe(true);
  });
});
