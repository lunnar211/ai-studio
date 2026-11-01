// P0: image key pool (lib/ai-pool.ts) — parsing, round-robin, and
// failover. Keys here are TEST VALUES ONLY, never real credentials.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AiError } from "../lib/ai/types";
import { imageApiKeys, imagePoolConfigured, runWithImageKeys } from "../lib/ai-pool";

const OLD_POOL = process.env.AI_API_KEYS;
const OLD_LEGACY = process.env.REPLICATE_API_TOKEN;

beforeEach(() => {
  delete process.env.AI_API_KEYS;
  delete process.env.REPLICATE_API_TOKEN;
});
afterEach(() => {
  if (OLD_POOL === undefined) delete process.env.AI_API_KEYS;
  else process.env.AI_API_KEYS = OLD_POOL;
  if (OLD_LEGACY === undefined) delete process.env.REPLICATE_API_TOKEN;
  else process.env.REPLICATE_API_TOKEN = OLD_LEGACY;
});

describe("imageApiKeys", () => {
  it("parses comma-separated keys, trims, and dedupes", () => {
    process.env.AI_API_KEYS = "key-one, key-two,,key-one , key-three";
    expect(imageApiKeys()).toEqual(["key-one", "key-two", "key-three"]);
  });
  it("appends the legacy token when it is not already listed", () => {
    process.env.AI_API_KEYS = "key-one";
    process.env.REPLICATE_API_TOKEN = "legacy-token";
    expect(imageApiKeys()).toEqual(["key-one", "legacy-token"]);
  });
  it("does not duplicate the legacy token when it is already in the pool", () => {
    process.env.AI_API_KEYS = "legacy-token";
    process.env.REPLICATE_API_TOKEN = "legacy-token";
    expect(imageApiKeys()).toEqual(["legacy-token"]);
  });
  it("reports unconfigured when the pool is empty", () => {
    expect(imageApiKeys()).toEqual([]);
    expect(imagePoolConfigured()).toBe(false);
  });
  it("never reads LLM/text keys", () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    expect(imageApiKeys()).toEqual([]);
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });
});

describe("runWithImageKeys", () => {
  it("throws AI_NOT_CONFIGURED when the pool is empty", async () => {
    await expect(runWithImageKeys(async () => "x")).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
  });
  it("rotates across keys on successive calls", async () => {
    process.env.AI_API_KEYS = "key-a,key-b";
    const seen: string[] = [];
    await runWithImageKeys(async (k) => {
      seen.push(k);
      return k;
    });
    await runWithImageKeys(async (k) => {
      seen.push(k);
      return k;
    });
    // Two consecutive calls must not both start on the same key.
    expect(seen[0]).not.toBe(seen[1]);
    expect(new Set(seen)).toEqual(new Set(["key-a", "key-b"]));
  });
  it("fails over to the next key on 429/401/402/5xx", async () => {
    process.env.AI_API_KEYS = "key-a,key-b";
    for (const status of [429, 401, 402, 500, 502, 503]) {
      const attempts: string[] = [];
      const out = await runWithImageKeys(async (k) => {
        attempts.push(k);
        // Fail the FIRST attempt whatever key rotation picked, so the
        // test deterministically exercises failover to the next key.
        if (attempts.length === 1) throw new AiError("X", "fail", status, status === 429);
        return "ok";
      });
      expect(out).toBe("ok");
      expect(attempts).toHaveLength(2);
      expect(attempts[0]).not.toBe(attempts[1]);
    }
  });
  it("throws immediately on non-retryable errors without burning the pool", async () => {
    process.env.AI_API_KEYS = "key-a,key-b,key-c";
    const attempts: string[] = [];
    await expect(
      runWithImageKeys(async (k) => {
        attempts.push(k);
        throw new AiError("BAD_INPUT", "bad input", 400);
      })
    ).rejects.toMatchObject({ code: "BAD_INPUT" });
    expect(attempts).toHaveLength(1);
  });
  it("throws the last error when every key fails retryably", async () => {
    process.env.AI_API_KEYS = "key-a,key-b";
    await expect(
      runWithImageKeys(async () => {
        throw new AiError("X", "fail", 503);
      })
    ).rejects.toMatchObject({ code: "X", status: 503 });
  });
});

describe("publicJobState scrub (P0 leak guarantee)", () => {
  it("maps engine labels to the neutral quality badge only", async () => {
    const { qualityFor } = await import("../lib/ai/public-job-state");
    expect(qualityFor("ai-colorize+standard-upscale")).toBe("ai");
    expect(qualityFor("ai-hd")).toBe("ai");
    expect(qualityFor("standard-upscale")).toBe("standard");
    expect(qualityFor(null)).toBe(null);
    expect(qualityFor("")).toBe(null);
  });
  it("never exposes engine/provider/model in the client shape", async () => {
    const { publicJobState } = await import("../lib/ai/public-job-state");
    const fake = {
      id: "job-1",
      status: "SUCCEEDED",
      stage: "done",
      mode: "colorize",
      credits: 2,
      engine: "ai-colorize+ai-hd",
    };
    const out = publicJobState(fake, { resultData: "abc" }) as Record<string, unknown>;
    expect("engine" in out).toBe(false);
    expect("provider" in out).toBe(false);
    expect("model" in out).toBe(false);
    expect(out.quality).toBe("ai");
    expect(JSON.stringify(out)).not.toMatch(/replicate|ddcolor|real-esrgan|gfpgan|deoldify/i);
  });
});
