import { describe, expect, it } from "vitest";
import {
  createFailOpenRateLimiter,
  createRateLimiter,
} from "../rate-limit";

describe("createRateLimiter", () => {
  it("allows requests under the limit", () => {
    const { rateLimit } = createRateLimiter();
    for (let i = 0; i < 3; i += 1) {
      const result = rateLimit("k1", { limit: 3, windowMs: 1000, now: 1000 });
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks once the limit is reached and reports a retry window", () => {
    const { rateLimit } = createRateLimiter();
    for (let i = 0; i < 3; i += 1) {
      rateLimit("k2", { limit: 3, windowMs: 1000, now: 1000 });
    }
    const blocked = rateLimit("k2", { limit: 3, windowMs: 1000, now: 1000 });
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
      expect(blocked.remaining).toBe(0);
    }
  });

  it("resets after the window elapses", () => {
    const { rateLimit } = createRateLimiter();
    for (let i = 0; i < 3; i += 1) {
      rateLimit("k3", { limit: 3, windowMs: 1000, now: 1000 });
    }
    const after = rateLimit("k3", { limit: 3, windowMs: 1000, now: 2100 });
    expect(after.allowed).toBe(true);
  });

  it("isolates distinct keys", () => {
    const { rateLimit } = createRateLimiter();
    for (let i = 0; i < 5; i += 1) {
      rateLimit("key-a", { limit: 5, windowMs: 1000, now: 1000 });
    }
    const other = rateLimit("key-b", { limit: 5, windowMs: 1000, now: 1000 });
    expect(other.allowed).toBe(true);
  });

  it("isolates distinct limits for the same key", () => {
    const { rateLimit } = createRateLimiter();
    const strict = rateLimit("shared", { limit: 1, windowMs: 1000, now: 1000 });
    const relaxed = rateLimit("shared", { limit: 2, windowMs: 1000, now: 1000 });

    expect(strict.remaining).toBe(0);
    expect(relaxed.remaining).toBe(1);
  });
});

describe("createFailOpenRateLimiter", () => {
  it("uses an allowed shared-store result", async () => {
    const shared = async () => ({ success: true, remaining: 4, reset: 2500 });
    const rateLimit = createFailOpenRateLimiter(() => shared);

    await expect(
      rateLimit("shared", { limit: 5, windowMs: 1000, now: 1000 }),
    ).resolves.toEqual({
      allowed: true,
      remaining: 4,
      resetAtMs: 2500,
    });
  });

  it("converts a blocked shared-store result", async () => {
    const shared = async () => ({ success: false, remaining: 0, reset: 2500 });
    const rateLimit = createFailOpenRateLimiter(() => shared);

    await expect(
      rateLimit("shared", { limit: 5, windowMs: 1000, now: 1000 }),
    ).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSec: 2,
    });
  });

  it("falls back when the shared store times out", async () => {
    const fallback = createRateLimiter().rateLimit;
    const shared = async () => ({
      success: true,
      remaining: 0,
      reset: 0,
      reason: "timeout" as const,
    });
    const rateLimit = createFailOpenRateLimiter(() => shared, fallback);
    const options = { limit: 1, windowMs: 1000, now: 1000 };

    await expect(rateLimit("timeout", options)).resolves.toEqual({
      allowed: true,
      remaining: 0,
      resetAtMs: 2000,
    });
    await expect(rateLimit("timeout", options)).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSec: 1,
    });
  });

  it("falls back when the shared store fails", async () => {
    const shared = async () => {
      throw new Error("unavailable");
    };
    const rateLimit = createFailOpenRateLimiter(() => shared);

    await expect(
      rateLimit("offline", { limit: 2, windowMs: 1000, now: 1000 }),
    ).resolves.toEqual({
      allowed: true,
      remaining: 1,
      resetAtMs: 2000,
    });
  });

  it("uses local limits when no shared store is configured", async () => {
    const rateLimit = createFailOpenRateLimiter(() => null);

    await expect(
      rateLimit("local", { limit: 1, windowMs: 1000, now: 1000 }),
    ).resolves.toEqual({
      allowed: true,
      remaining: 0,
      resetAtMs: 2000,
    });
  });
});