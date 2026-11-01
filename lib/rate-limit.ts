// Rate limiting: Upstash Redis when configured, otherwise an in-memory
// per-IP fallback. The in-memory fallback does NOT persist across
// serverless instances or restarts; it is a documented best-effort guard,
// not a distributed limiter.
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Check = { ok: boolean; remaining: number; limit: number };

// Upstash is used when configured; the limiter window is built per call
// so the effective limit (single limits config) applies instead of a
// hardcoded 10. The key prefix stays "ai-studio" so existing buckets
// keep working across the change.
const upstashConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

function upstashLimiter(limit: number, window: `${number} ${"s" | "m" | "h" | "d"}`): Ratelimit | null {
  if (!upstashConfigured) return null;
  try {
    return new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.fixedWindow(limit, window),
      analytics: false,
      prefix: "ai-studio",
    });
  } catch {
    return null;
  }
}

// key -> { count, resetAt }
const memory = new Map<string, { count: number; resetAt: number }>();
const DAY_MS = 24 * 60 * 60 * 1000;

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export async function checkAiRateLimit(ip: string, tool: string, limit = 10): Promise<Check> {
  const limiter = upstashLimiter(limit, "1 d");
  if (limiter) {
    try {
      const res = await limiter.limit(`${tool}:${ip}`);
      return { ok: res.success, remaining: res.remaining, limit };
    } catch {
      // Fall through to the in-memory guard rather than failing open fully.
    }
  }
  const key = `${tool}:${ip}`;
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + DAY_MS });
    return { ok: true, remaining: limit - 1, limit };
  }
  if (entry.count >= limit) return { ok: false, remaining: 0, limit };
  entry.count += 1;
  return { ok: true, remaining: limit - entry.count, limit };
}

/**
 * Per-IP minute limiter for upload endpoints (P0 security rule): 5
 * requests/minute per IP. Upstash uses a 60s fixed window when
 * configured; otherwise an in-memory 60s bucket applies. The
 * in-memory fallback does NOT persist across serverless instances or
 * restarts — a documented best-effort guard, not a distributed
 * limiter. Friendly 429 text is the caller's job (generic message).
 */
export async function checkMinuteRateLimit(ip: string, tool: string, limit = 5): Promise<Check> {
  const limiter = upstashLimiter(limit, "60 s");
  if (limiter) {
    try {
      const res = await limiter.limit(`minute:${tool}:${ip}`);
      return { ok: res.success, remaining: res.remaining, limit };
    } catch {
      // Fall through to the in-memory guard rather than failing open fully.
    }
  }
  const key = `minute:${tool}:${ip}`;
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + 60 * 1000 });
    return { ok: true, remaining: limit - 1, limit };
  }
  if (entry.count >= limit) return { ok: false, remaining: 0, limit };
  entry.count += 1;
  return { ok: true, remaining: limit - entry.count, limit };
}

export function rateLimitHeaders(remaining: number, limit: number) {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
  };
}

// Read-only peek for the free-tier counter: returns the guest's current
// remaining count WITHOUT consuming a unit. Only the in-memory fallback
// supports this; Upstash has no peek operation (reading its internal keys
// would be guessing at library internals), so Upstash guests get null and
// the UI shows the daily limit without a live count instead of a wrong one.
export async function peekAiRateLimit(ip: string, tool: string, limit = 10): Promise<{ remaining: number; limit: number } | null> {
  if (upstashConfigured) return null;
  const entry = memory.get(`${tool}:${ip}`);
  if (!entry || entry.resetAt <= Date.now()) return { remaining: limit, limit };
  return { remaining: Math.max(0, limit - entry.count), limit };
}
