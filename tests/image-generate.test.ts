// Raster image generation tests: adapters, chain, size maps, limits.
// ALL provider calls are stubbed — no real Gemini, fal.ai, or HF
// call is ever made here, so no money is ever spent by tests.
// (The task forbids even a test paid call; the fal key is paid.)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiError } from "../lib/ai/types";
import { geminiGenerateImage } from "../lib/ai/image-generate/gemini";
import { falGenerateImage } from "../lib/ai/image-generate/fal";
import { hfGenerateImage } from "../lib/ai/image-generate/huggingface";
import { generateImage, generateProvidersConfigured } from "../lib/ai/image-generate/chain";
import { GENERATE_SIZE_MAP, GENERATE_SIZES } from "../lib/ai/image-generate/types";
import { GENERATE_COST, GENERATE_DAILY_BUDGET } from "../lib/ai/image-generate/limits";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function bytesResponse(bytes: number[], mime = "image/jpeg") {
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? mime : null) },
    json: async () => ({}),
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  };
}

const GEMINI_IMAGE_BODY = {
  candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from([1, 2, 3]).toString("base64") } }] } }],
};

describe("size maps", () => {
  it("every UI size has a Gemini aspect and a fal image_size", () => {
    for (const size of GENERATE_SIZES) {
      expect(GENERATE_SIZE_MAP[size].geminiAspect).toMatch(/^\d+:\d+$/);
      expect([
        "square_hd",
        "square",
        "portrait_4_3",
        "portrait_16_9",
        "landscape_4_3",
        "landscape_16_9",
      ]).toContain(GENERATE_SIZE_MAP[size].falImageSize);
    }
    expect(GENERATE_SIZE_MAP.square.falImageSize).toBe("square_hd");
    expect(GENERATE_SIZE_MAP.wide.falImageSize).toBe("landscape_16_9");
  });
});

describe("generation limits", () => {
  it("FREE 10/day, PREMIUM 100/day, 1 credit per image", () => {
    expect(GENERATE_DAILY_BUDGET.FREE).toBe(10);
    expect(GENERATE_DAILY_BUDGET.PREMIUM).toBe(100);
    expect(GENERATE_COST).toBe(1);
  });
});

describe("gemini adapter", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_IMAGE_MODEL;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_IMAGE_MODEL;
    vi.unstubAllGlobals();
  });

  it("throws AI_NOT_CONFIGURED 503 without a key and never fetches", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fetch must not be called without a key");
    }) as unknown as typeof fetch;
    await expect(geminiGenerateImage({ prompt: "a cat", size: "square" })).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
      status: 503,
    });
  });

  it("returns parsed image bytes with the primary model on success", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const calls: string[] = [];
    globalThis.fetch = (async (url: unknown) => {
      calls.push(String(url));
      return jsonResponse(200, GEMINI_IMAGE_BODY);
    }) as unknown as typeof fetch;
    const result = await geminiGenerateImage({ prompt: "a cat", size: "square" });
    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemini-nano-banana-2.1");
    expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
    expect(calls[0]).toContain("gemini-nano-banana-2.1");
  });

  it("falls back to the Lite model when the primary 404s", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const calls: string[] = [];
    globalThis.fetch = (async (url: unknown) => {
      calls.push(String(url));
      if (String(url).includes("gemini-nano-banana-2.1")) return jsonResponse(404, { error: { status: "NOT_FOUND" } });
      return jsonResponse(200, GEMINI_IMAGE_BODY);
    }) as unknown as typeof fetch;
    const result = await geminiGenerateImage({ prompt: "a cat", size: "square" });
    expect(result.model).toBe("gemini-3.1-flash-lite-image");
    expect(calls).toHaveLength(2);
  });

  it("never falls back when the model is overridden in env", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_IMAGE_MODEL = "custom-model";
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return jsonResponse(404, { error: { status: "NOT_FOUND" } });
    }) as unknown as typeof fetch;
    await expect(geminiGenerateImage({ prompt: "a cat", size: "square" })).rejects.toMatchObject({
      code: "GEMINI_IMAGE_FAILED",
    });
    expect(calls).toBe(1);
  });

  it("marks 429 as rate-limited", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    globalThis.fetch = (async () => jsonResponse(429, { error: { status: "RESOURCE_EXHAUSTED" } })) as unknown as typeof fetch;
    let err: AiError | null = null;
    try {
      await geminiGenerateImage({ prompt: "a cat", size: "square" });
    } catch (e) {
      err = e as AiError;
    }
    expect(err?.rateLimited).toBe(true);
    expect(err?.status).toBe(429);
  });
});

describe("fal adapter", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    delete process.env.FAL_KEY;
    delete process.env.FAL_IMAGE_MODEL;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.FAL_KEY;
    delete process.env.FAL_IMAGE_MODEL;
    vi.unstubAllGlobals();
  });

  it("throws AI_NOT_CONFIGURED 503 without a key and never fetches", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fetch must not be called without a key");
    }) as unknown as typeof fetch;
    await expect(falGenerateImage({ prompt: "a cat", size: "square" })).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
      status: 503,
    });
  });

  it("runs submit -> poll -> result -> download using the returned URLs", async () => {
    process.env.FAL_KEY = "test-key";
    const calls: Array<{ url: string; auth?: string; body?: unknown }> = [];
    let polls = 0;
    globalThis.fetch = (async (url: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
      const u = String(url);
      calls.push({ url: u, auth: init?.headers?.Authorization, body: init?.body ? JSON.parse(init.body) : undefined });
      if (u === "https://queue.fal.run/fal-ai/flux/schnell") {
        return jsonResponse(200, {
          request_id: "req-1",
          status_url: "https://queue.fal.run/status-1",
          response_url: "https://queue.fal.run/result-1",
        });
      }
      if (u === "https://queue.fal.run/status-1") {
        polls += 1;
        return jsonResponse(200, { status: polls < 2 ? "IN_PROGRESS" : "COMPLETED" });
      }
      if (u === "https://queue.fal.run/result-1") {
        return jsonResponse(200, { data: { images: [{ url: "https://example.invalid/img.jpg" }] } });
      }
      if (u === "https://example.invalid/img.jpg") return bytesResponse([9, 8, 7]);
      throw new Error(`unexpected url ${u}`);
    }) as unknown as typeof fetch;
    const result = await falGenerateImage({ prompt: "a cat", size: "wide", timeoutMs: 30000 });
    expect(result.provider).toBe("fal");
    expect(result.model).toBe("fal-ai/flux/schnell");
    expect(result.buffer).toEqual(Buffer.from([9, 8, 7]));
    expect(calls[0].auth).toBe("Key test-key");
    expect((calls[0].body as { input?: { image_size?: string } }).input?.image_size).toBe("landscape_16_9");
    expect(polls).toBe(2);
  });

  it("rejects with FAL_AUTH on a 401 submit", async () => {
    process.env.FAL_KEY = "bad-key";
    globalThis.fetch = (async () => jsonResponse(401, { detail: "Unauthorized" })) as unknown as typeof fetch;
    await expect(falGenerateImage({ prompt: "a cat", size: "square" })).rejects.toMatchObject({ code: "FAL_AUTH" });
  });

  it("times out when the queue never completes", async () => {
    process.env.FAL_KEY = "test-key";
    globalThis.fetch = (async (url: unknown) => {
      const u = String(url);
      if (u === "https://queue.fal.run/fal-ai/flux/schnell") {
        return jsonResponse(200, {
          request_id: "req-1",
          status_url: "https://queue.fal.run/status-1",
          response_url: "https://queue.fal.run/result-1",
        });
      }
      return jsonResponse(200, { status: "IN_PROGRESS" });
    }) as unknown as typeof fetch;
    await expect(falGenerateImage({ prompt: "a cat", size: "square", timeoutMs: 100 })).rejects.toMatchObject({
      code: "FAL_TIMEOUT",
    });
  });
});

describe("huggingface adapter (disabled)", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    delete process.env.HF_ENABLED;
    delete process.env.HF_TOKEN;
    delete process.env.HF_IMAGE_MODEL;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.HF_ENABLED;
    delete process.env.HF_TOKEN;
    delete process.env.HF_IMAGE_MODEL;
    vi.unstubAllGlobals();
  });

  it("throws HF_DISABLED without the opt-in flag and never fetches", async () => {
    process.env.HF_TOKEN = "test-token";
    process.env.HF_IMAGE_MODEL = "black-forest-labs/FLUX.1-schnell";
    globalThis.fetch = (async () => {
      throw new Error("fetch must not be called while disabled");
    }) as unknown as typeof fetch;
    await expect(hfGenerateImage({ prompt: "a cat", size: "square" })).rejects.toMatchObject({ code: "HF_DISABLED" });
  });

  it("throws AI_NOT_CONFIGURED when the flag is on but the model is missing", async () => {
    process.env.HF_ENABLED = "true";
    process.env.HF_TOKEN = "test-token";
    globalThis.fetch = (async () => {
      throw new Error("fetch must not be called without a model");
    }) as unknown as typeof fetch;
    await expect(hfGenerateImage({ prompt: "a cat", size: "square" })).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
    });
  });

  it("returns bytes when flag + token + model are all set (mocked)", async () => {
    process.env.HF_ENABLED = "true";
    process.env.HF_TOKEN = "test-token";
    process.env.HF_IMAGE_MODEL = "black-forest-labs/FLUX.1-schnell";
    globalThis.fetch = (async () => bytesResponse([4, 5, 6], "image/png")) as unknown as typeof fetch;
    const result = await hfGenerateImage({ prompt: "a cat", size: "square" });
    expect(result.provider).toBe("huggingface");
    expect(result.buffer).toEqual(Buffer.from([4, 5, 6]));
  });
});

describe("generation chain", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_IMAGE_MODEL;
    delete process.env.FAL_KEY;
    delete process.env.FAL_IMAGE_MODEL;
    delete process.env.HF_ENABLED;
    delete process.env.HF_TOKEN;
    delete process.env.HF_IMAGE_MODEL;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_IMAGE_MODEL;
    delete process.env.FAL_KEY;
    delete process.env.FAL_IMAGE_MODEL;
    delete process.env.HF_ENABLED;
    delete process.env.HF_TOKEN;
    delete process.env.HF_IMAGE_MODEL;
    vi.unstubAllGlobals();
  });

  it("reports nothing configured when no keys are set", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fetch must not be called");
    }) as unknown as typeof fetch;
    expect(generateProvidersConfigured({})).toBe(false);
    await expect(generateImage({ prompt: "a cat", size: "square" }, {})).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
    });
  });

  it("uses Gemini first and never calls fal on Gemini success", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.FAL_KEY = "test-key";
    const hosts: string[] = [];
    globalThis.fetch = (async (url: unknown) => {
      hosts.push(String(url));
      return jsonResponse(200, GEMINI_IMAGE_BODY);
    }) as unknown as typeof fetch;
    const result = await generateImage({ prompt: "a cat", size: "square" }, {});
    expect(result.provider).toBe("gemini");
    expect(hosts.some((h) => h.includes("fal.run"))).toBe(false);
  });

  it("falls through to fal when Gemini fails, and skips disabled HF", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.FAL_KEY = "test-key";
    globalThis.fetch = (async (url: unknown) => {
      const u = String(url);
      if (u.includes("generativelanguage.googleapis.com")) return jsonResponse(502, { error: {} });
      if (u === "https://queue.fal.run/fal-ai/flux/schnell") {
        return jsonResponse(200, {
          request_id: "req-1",
          status_url: "https://queue.fal.run/status-1",
          response_url: "https://queue.fal.run/result-1",
        });
      }
      if (u === "https://queue.fal.run/status-1") return jsonResponse(200, { status: "COMPLETED" });
      if (u === "https://queue.fal.run/result-1") {
        return jsonResponse(200, { data: { images: [{ url: "https://example.invalid/img.jpg" }] } });
      }
      if (u === "https://example.invalid/img.jpg") return bytesResponse([1, 1, 1]);
      throw new Error(`unexpected url ${u}`);
    }) as unknown as typeof fetch;
    const result = await generateImage({ prompt: "a cat", size: "square" }, {});
    expect(result.provider).toBe("fal");
    expect(generateProvidersConfigured({})).toBe(true);
  });

  it("prefers a rate-limit error when one provider was rate-limited", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.FAL_KEY = "test-key";
    globalThis.fetch = (async (url: unknown) => {
      const u = String(url);
      if (u.includes("generativelanguage.googleapis.com")) return jsonResponse(429, { error: {} });
      return jsonResponse(502, { error: {} });
    }) as unknown as typeof fetch;
    let err: AiError | null = null;
    try {
      await generateImage({ prompt: "a cat", size: "square" }, {});
    } catch (e) {
      err = e as AiError;
    }
    expect(err?.rateLimited).toBe(true);
    expect(err?.status).toBe(429);
  });

  it("respects the admin kill switch for fal", async () => {
    process.env.FAL_KEY = "test-key";
    globalThis.fetch = (async () => {
      throw new Error("fetch must not be called when toggled off");
    }) as unknown as typeof fetch;
    expect(generateProvidersConfigured({ "ai.provider.fal": "false" })).toBe(false);
    await expect(generateImage({ prompt: "a cat", size: "square" }, { "ai.provider.fal": "false" })).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
    });
  });
});
