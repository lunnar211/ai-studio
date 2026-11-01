// OpenRouter moderation fallback tests: adapter behaviour (no-key 503,
// mocked SAFE/UNSAFE parsing, no fake output) and the router chain
// (NVIDIA failure -> OpenRouter; OpenRouter skipped when unconfigured;
// no provider -> checked:false, fetch never called). All fetch calls
// are stubbed — no real provider is ever contacted.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBreakers } from "../lib/ai/circuit";
import { openrouterChat, openrouterModerateText } from "../lib/ai/adapters/openrouter";
import { routeModerationText } from "../lib/ai/router";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("openrouter adapter", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    resetBreakers();
    delete process.env.OPENROUTER_API_KEY;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.OPENROUTER_API_KEY;
    vi.unstubAllGlobals();
  });

  it("throws AI_NOT_CONFIGURED 503 without a key (chat + moderation)", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fetch must not be called without a key");
    }) as unknown as typeof fetch;
    await expect(openrouterChat({ user: "hi" })).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
      status: 503,
    });
    await expect(openrouterModerateText({ text: "hi" })).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
      status: 503,
    });
  });

  it("returns real parsed text on a mocked success", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    globalThis.fetch = (async () => {
      return jsonResponse(200, { choices: [{ message: { content: "hello back" } }] });
    }) as unknown as typeof fetch;
    const result = await openrouterChat({ user: "hi" });
    expect(result.provider).toBe("openrouter");
    expect(result.text).toBe("hello back");
    expect(result.model).toBe("liquid/lfm-2.5-2.6b:free");
  });

  it("classifies SAFE as unflagged and UNSAFE as flagged", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    globalThis.fetch = (async () => {
      return jsonResponse(200, { choices: [{ message: { content: "SAFE" } }] });
    }) as unknown as typeof fetch;
    const safe = await openrouterModerateText({ text: "a blue logo" });
    expect(safe).toMatchObject({ flagged: false, categories: [], provider: "openrouter" });

    globalThis.fetch = (async () => {
      return jsonResponse(200, { choices: [{ message: { content: "UNSAFE harassment" } }] });
    }) as unknown as typeof fetch;
    const unsafe = await openrouterModerateText({ text: "something nasty" });
    expect(unsafe.flagged).toBe(true);
    expect(unsafe.categories).toEqual(["unsafe"]);
  });
});

describe("routeModerationText fallback chain", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    resetBreakers();
    process.env.NVIDIA_API_KEY = "test-key";
    process.env.OPENROUTER_API_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.NVIDIA_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    resetBreakers();
    vi.unstubAllGlobals();
  });

  it("falls back to OpenRouter when NVIDIA fails", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(url);
      if (url.includes("integrate.api.nvidia.com")) return jsonResponse(500, {});
      if (url.includes("openrouter.ai")) {
        return jsonResponse(200, { choices: [{ message: { content: "SAFE" } }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
    const result = await routeModerationText({ text: "a blue logo" });
    expect(result).toMatchObject({ checked: true, flagged: false, provider: "openrouter" });
    expect(calls.some((u) => u.includes("integrate.api.nvidia.com"))).toBe(true);
    expect(calls.some((u) => u.includes("openrouter.ai"))).toBe(true);
  });

  it("skips OpenRouter when it is unconfigured and reports unchecked", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(url);
      if (url.includes("integrate.api.nvidia.com")) return jsonResponse(500, {});
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
    const result = await routeModerationText({ text: "a blue logo" });
    expect(result).toMatchObject({ checked: false, flagged: false });
    expect(calls.some((u) => u.includes("openrouter.ai"))).toBe(false);
  });

  it("never calls a provider and reports unchecked when no key is set", async () => {
    delete process.env.NVIDIA_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    globalThis.fetch = (async () => {
      throw new Error("fetch must not be called without a provider key");
    }) as unknown as typeof fetch;
    const result = await routeModerationText({ text: "a blue logo" });
    expect(result).toMatchObject({ checked: false, flagged: false });
  });

  it("uses the NVIDIA answer when NVIDIA succeeds and never calls OpenRouter", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(url);
      if (url.includes("integrate.api.nvidia.com")) {
        return jsonResponse(200, { choices: [{ message: { content: "SAFE" } }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
    const result = await routeModerationText({ text: "a blue logo" });
    expect(result).toMatchObject({ checked: true, flagged: false, provider: "nvidia" });
    expect(calls.some((u) => u.includes("openrouter.ai"))).toBe(false);
  });

  it("reports unchecked, never flagged, when every provider fails", async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("integrate.api.nvidia.com")) return jsonResponse(500, {});
      if (url.includes("openrouter.ai")) {
        return jsonResponse(200, { choices: [{ message: { content: "" } }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
    const result = await routeModerationText({ text: "a blue logo" });
    expect(result).toMatchObject({ checked: false, flagged: false });
  });
});
