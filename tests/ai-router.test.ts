// Phase 0 router tests: fallback across providers, circuit breaker,
// timeout, and the no-provider-configured error — all with stubbed
// fetch (no real provider is ever called).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTripped, recordFailure, recordSuccess, resetBreakers } from "../lib/ai/circuit";
import { providerEnabled } from "../lib/ai/registry";
import { routeText } from "../lib/ai/router";

type FetchStub = (url: string, init?: { signal?: AbortSignal }) => Promise<unknown>;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("circuit breaker", () => {
  beforeEach(() => resetBreakers());
  it("trips after 3 failures and clears on success", () => {
    expect(isTripped("groq")).toBe(false);
    recordFailure("groq");
    recordFailure("groq");
    expect(isTripped("groq")).toBe(false);
    recordFailure("groq");
    expect(isTripped("groq")).toBe(true);
    recordSuccess("groq");
    expect(isTripped("groq")).toBe(false);
  });
  it("counts a 429 as two failures", () => {
    recordFailure("groq", true);
    recordFailure("groq", true);
    expect(isTripped("groq")).toBe(true);
  });
});

describe("registry enablement", () => {
  it("is disabled without an env key, and a false toggle disables it", () => {
    const saved = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    expect(providerEnabled("groq", {})).toBe(false);
    process.env.GROQ_API_KEY = "test-key";
    expect(providerEnabled("groq", {})).toBe(true);
    expect(providerEnabled("groq", { "ai.provider.groq": "false" })).toBe(false);
    expect(providerEnabled("groq", { "ai.provider.groq": "true" })).toBe(true);
    if (saved === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = saved;
  });
  it("sharp is on by default and off only with an explicit false toggle", () => {
    expect(providerEnabled("sharp", {})).toBe(true);
    expect(providerEnabled("sharp", { "ai.provider.sharp": "false" })).toBe(false);
  });
});

describe("routeText with stubbed fetch", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    resetBreakers();
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    delete process.env.GEMINI_API_KEY;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    resetBreakers();
    vi.unstubAllGlobals();
  });

  it("falls back from a failing Groq to OpenRouter", async () => {
    const stub: FetchStub = async (url) => {
      if (url.includes("api.groq.com")) return jsonResponse(500, { error: "boom" });
      if (url.includes("openrouter.ai")) {
        return jsonResponse(200, { choices: [{ message: { content: "fallback answer" } }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    globalThis.fetch = stub as unknown as typeof fetch;
    const result = await routeText({ user: "hello", timeoutMs: 5000 });
    expect(result.provider).toBe("openrouter");
    expect(result.text).toBe("fallback answer");
  });

  it("fails fast on timeout instead of hanging", async () => {
    const stub: FetchStub = async (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          setTimeout(() => reject(new Error("no signal")), 10);
          return;
        }
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    globalThis.fetch = stub as unknown as typeof fetch;
    const started = Date.now();
    await expect(routeText({ user: "hello", timeoutMs: 50 })).rejects.toThrow();
    // Two providers x (retry + timeout) at 50ms each, plus overhead:
    // must finish in well under 10s (a hang would blow past it).
    expect(Date.now() - started).toBeLessThan(10000);
  });

  it("throws a configured error when no text provider has a key", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    globalThis.fetch = (async () => {
      throw new Error("fetch must not be called without a provider key");
    }) as unknown as typeof fetch;
    await expect(routeText({ user: "hello" })).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
  });
});
