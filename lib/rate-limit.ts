// Rate limiting: Upstash Redis when configured, otherwise an in-memory
// per-IP fallback. The in-memory fallback does NOT persist across
// serverless instances or restarts; it is a documented best-effort guard,
// not a distributed limiter.
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Check = { ok: boolean; remaining: number; limit: number };

const upstash =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.fixedWindow(10, "1 d"),
        analytics: false,
        prefix: "ai-studio",
      })
    : null;

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

export async function checkAiRateLimit(ip: string, tool: string): Promise<Check> {
  const limit = 10;
  if (upstash) {
    try {
      const res = await upstash.limit(`${tool}:${ip}`);
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
export async function peekAiRateLimit(ip: string, tool: string): Promise<{ remaining: number; limit: number } | null> {
  if (upstash) return null;
  const limit = 10;
  const entry = memory.get(`${tool}:${ip}`);
  if (!entry || entry.resetAt <= Date.now()) return { remaining: limit, limit };
  return { remaining: Math.max(0, limit - entry.count), limit };
}
