import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";

export const CHAT_LIMIT = 20;
export const CHAT_WINDOW_MS = 60_000;
export const VISION_LIMIT = 10;
export const VISION_WINDOW_MS = 60_000;

const MAX_BUCKETS = 10_000;
const UPSTASH_PREFIX = "studymate:ratelimit";
const UPSTASH_TIMEOUT_MS = 1_000;

export type RateLimitOptions = {
  limit?: number;
  windowMs?: number;
  now?: number;
};

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAtMs: number }
  | { allowed: false; remaining: 0; retryAfterSec: number };

type Bucket = {
  count: number;
  windowStart: number;
};

type SharedRateLimitResponse = {
  success: boolean;
  remaining: number;
  reset: number;
  reason?: "timeout" | "cacheBlock" | "denyList";
};

type MemoryRateLimiter = (
  key: string,
  options?: RateLimitOptions,
) => RateLimitResult;

type SharedRateLimiter = (
  key: string,
  options?: RateLimitOptions,
) => Promise<SharedRateLimitResponse>;

type AsyncRateLimiter = (
  key: string,
  options?: RateLimitOptions,
) => Promise<RateLimitResult>;

export function createRateLimiter() {
  const buckets = new Map<string, Bucket>();

  function sweep(now: number, windowMs: number) {
    if (buckets.size <= MAX_BUCKETS) return;
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart > windowMs * 2) buckets.delete(key);
    }
  }

  function rateLimit(key: string, options: RateLimitOptions = {}): RateLimitResult {
    const limit = options.limit ?? CHAT_LIMIT;
    const windowMs = options.windowMs ?? CHAT_WINDOW_MS;
    const now = options.now ?? Date.now();

    sweep(now, windowMs);

    const bucketKey = `${limit}:${windowMs}:${key}`;
    let bucket = buckets.get(bucketKey);
    if (!bucket || now - bucket.windowStart >= windowMs) {
      bucket = { count: 0, windowStart: now };
    }

    if (bucket.count >= limit) {
      buckets.set(bucketKey, bucket);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(
          1,
          Math.ceil((bucket.windowStart + windowMs - now) / 1000),
        ),
      };
    }

    bucket.count += 1;
    buckets.set(bucketKey, bucket);
    return {
      allowed: true,
      remaining: limit - bucket.count,
      resetAtMs: bucket.windowStart + windowMs,
    };
  }

  return { rateLimit };
}

function createUpstashRateLimiter(redis: Redis): SharedRateLimiter {
  const limiters = new Map<string, Ratelimit>();

  return async (key, options = {}) => {
    const limit = options.limit ?? CHAT_LIMIT;
    const windowMs = options.windowMs ?? CHAT_WINDOW_MS;
    const configKey = `${limit}:${windowMs}`;
    let limiter = limiters.get(configKey);

    if (!limiter) {
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
        prefix: UPSTASH_PREFIX,
        analytics: false,
        ephemeralCache: false,
        timeout: UPSTASH_TIMEOUT_MS,
        enableTelemetry: false,
      });
      limiters.set(configKey, limiter);
    }

    return limiter.limit(`${configKey}:${key}`);
  };
}

function sharedResult(
  result: SharedRateLimitResponse,
  now: number,
): RateLimitResult {
  if (result.success) {
    return {
      allowed: true,
      remaining: Math.max(0, result.remaining),
      resetAtMs: result.reset,
    };
  }

  return {
    allowed: false,
    remaining: 0,
    retryAfterSec: Math.max(1, Math.ceil((result.reset - now) / 1000)),
  };
}

export function createFailOpenRateLimiter(
  getShared: () => SharedRateLimiter | null,
  fallback: MemoryRateLimiter = createRateLimiter().rateLimit,
): AsyncRateLimiter {
  return async (key, options = {}) => {
    try {
      const shared = getShared();
      if (shared) {
        const result = await shared(key, options);
        if (result.reason !== "timeout") {
          return sharedResult(result, options.now ?? Date.now());
        }
        logger.warn("rate limit: shared store timed out; using local fallback");
      }
    } catch {
      logger.warn("rate limit: shared store unavailable; using local fallback");
    }

    return fallback(key, options);
  };
}

const memoryRateLimit = createRateLimiter().rateLimit;
let upstashRateLimit: SharedRateLimiter | undefined;

function configuredUpstashRateLimiter(): SharedRateLimiter | null {
  if (upstashRateLimit) return upstashRateLimit;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;

  upstashRateLimit = createUpstashRateLimiter(
    new Redis({ url, token, enableTelemetry: false }),
  );
  return upstashRateLimit;
}

export const rateLimit = createFailOpenRateLimiter(
  configuredUpstashRateLimiter,
  memoryRateLimit,
);

/**
 * Best-effort client identifier for rate limiting. Trusted proxies populate
 * these headers; reversed proxies must be configured accordingly.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  const cfConnecting = request.headers.get("cf-connecting-ip");
  if (cfConnecting) return cfConnecting;
  return "unknown";
}