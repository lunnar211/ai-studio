import { describe, expect, it, vi } from "vitest";
import {
  aiStartLimit,
  aiStartSlotsUsed,
  releaseAiStartSlot,
  tryAcquireAiStartSlot,
} from "../lib/concurrency";

describe("AI start concurrency slots", () => {
  it("acquires up to the limit, then fails fast", () => {
    const limit = aiStartLimit();
    expect(limit).toBeGreaterThan(0);
    // Drain: the counter starts at 0 in a fresh module, but other tests
    // in this file share it, so acquire until refusal and count.
    let acquired = 0;
    while (tryAcquireAiStartSlot()) acquired += 1;
    expect(acquired).toBeLessThanOrEqual(limit);
    expect(tryAcquireAiStartSlot()).toBe(false);
    // Release everything and confirm the pool is usable again.
    for (let i = 0; i < acquired; i++) releaseAiStartSlot();
    expect(aiStartSlotsUsed()).toBe(0);
    expect(tryAcquireAiStartSlot()).toBe(true);
    releaseAiStartSlot();
  });
  it("release never drives the count negative", () => {
    while (aiStartSlotsUsed() > 0) releaseAiStartSlot();
    releaseAiStartSlot();
    releaseAiStartSlot();
    expect(aiStartSlotsUsed()).toBe(0);
  });
  it("respects the env override with an invalid value falling back to 10", () => {
    const prev = process.env.AI_MAX_CONCURRENT_STARTS;
    process.env.AI_MAX_CONCURRENT_STARTS = "not-a-number";
    expect(aiStartLimit()).toBe(10);
    process.env.AI_MAX_CONCURRENT_STARTS = "3";
    expect(aiStartLimit()).toBe(3);
    if (prev === undefined) delete process.env.AI_MAX_CONCURRENT_STARTS;
    else process.env.AI_MAX_CONCURRENT_STARTS = prev;
    vi.unstubAllEnvs();
  });
});
