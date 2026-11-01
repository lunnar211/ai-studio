import { describe, expect, it } from "vitest";
import { checkMinuteRateLimit } from "../lib/rate-limit";

// Upstash is unconfigured in the test env, so these exercise the
// in-memory fallback. Unique IPs per test keep buckets isolated.
describe("checkMinuteRateLimit (in-memory fallback)", () => {
  it("allows 5 requests per minute, then blocks with remaining 0", async () => {
    const ip = `test-minute-${Date.now()}-a`;
    for (let i = 0; i < 5; i++) {
      const r = await checkMinuteRateLimit(ip, "photo-enhance-test", 5);
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(4 - i);
    }
    const blocked = await checkMinuteRateLimit(ip, "photo-enhance-test", 5);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
  });
  it("keeps buckets separate per IP and per tool", async () => {
    const ip1 = `test-minute-${Date.now()}-b1`;
    const ip2 = `test-minute-${Date.now()}-b2`;
    await checkMinuteRateLimit(ip1, "photo-enhance-test", 1);
    expect((await checkMinuteRateLimit(ip1, "photo-enhance-test", 1)).ok).toBe(false);
    expect((await checkMinuteRateLimit(ip2, "photo-enhance-test", 1)).ok).toBe(true);
    expect((await checkMinuteRateLimit(ip1, "other-tool-test", 1)).ok).toBe(true);
  });
});
