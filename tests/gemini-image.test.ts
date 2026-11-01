// Nano Banana (Gemini image) adapter: request shape, response
// parsing, and error mapping — all with a mocked fetch, no network,
// no key. The live call is verified by the owner's own use once
// GEMINI_API_KEY is in Vercel.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  GEMINI_COLORIZE_PROMPT,
  GEMINI_PENDING_PREDICTION_ID,
  closestGeminiAspectRatio,
  geminiColorize,
  geminiImageConfigured,
  geminiImageFallbackModel,
  geminiImageModel,
  pickImagePart,
} from "../lib/ai/adapters/gemini-image";
import { AiError } from "../lib/ai/types";

const FAKE_PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");

function mockFetchOnce(status: number, json: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    status,
    json: async () => json,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("gemini-image adapter", () => {
  const OLD_KEY = process.env.GEMINI_API_KEY;
  const OLD_MODEL = process.env.GEMINI_IMAGE_MODEL;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_IMAGE_MODEL;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (OLD_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = OLD_KEY;
    if (OLD_MODEL === undefined) delete process.env.GEMINI_IMAGE_MODEL;
    else process.env.GEMINI_IMAGE_MODEL = OLD_MODEL;
  });

  it("defaults to the Nano Banana 2.1 model and reports configured with a key", () => {
    expect(geminiImageModel()).toBe("gemini-nano-banana-2.1");
    expect(geminiImageFallbackModel()).toBe("gemini-3.1-flash-lite-image");
    expect(geminiImageConfigured()).toBe(true);
    expect(GEMINI_PENDING_PREDICTION_ID).toBe("gemini:pending");
  });

  it("sends prompt + image to generateContent and decodes the image part", async () => {
    const fetchMock = mockFetchOnce(200, {
      candidates: [
        {
          content: {
            parts: [
              { text: "Here is the colorized photo." },
              { inlineData: { mimeType: "image/png", data: FAKE_PNG_B64 } },
            ],
          },
        },
      ],
    });
    const out = await geminiColorize({ image: Buffer.from([1, 2, 3]), mime: "image/jpeg" });
    expect(out.mime).toBe("image/png");
    expect(out.model).toBe("gemini-nano-banana-2.1");
    expect(out.buffer.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("gemini-nano-banana-2.1:generateContent");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const parts = body.contents[0].parts;
    expect(parts[0].text).toBe(GEMINI_COLORIZE_PROMPT);
    expect(parts[1].inlineData.mimeType).toBe("image/jpeg");
    expect(body.generationConfig.responseModalities).toContain("IMAGE");
    expect(body.generationConfig.imageConfig.imageSize).toBe("1K");
    expect(body.generationConfig.imageConfig.aspectRatio).toBeUndefined();
  });

  it("sends the input-matched aspect ratio when given (never a forced square)", async () => {
    const fetchMock = mockFetchOnce(200, {
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: FAKE_PNG_B64 } }] } }],
    });
    await geminiColorize({ image: Buffer.from([1]), mime: "image/jpeg", aspectRatio: "3:2" });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.generationConfig.imageConfig.aspectRatio).toBe("3:2");
    expect(body.generationConfig.imageConfig.imageSize).toBe("1K");
  });

  it("falls back to Lite once when the default primary 404s, and reports the model used", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 404, json: async () => ({ error: { status: "NOT_FOUND" } }) })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: FAKE_PNG_B64 } }] } }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const out = await geminiColorize({ image: Buffer.from([1]), mime: "image/jpeg" });
    expect(out.model).toBe("gemini-3.1-flash-lite-image");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("gemini-nano-banana-2.1:generateContent");
    expect(String(fetchMock.mock.calls[1][0])).toContain("gemini-3.1-flash-lite-image:generateContent");
  });

  it("does not fall back when the owner overrode the model (one call, then fail)", async () => {
    process.env.GEMINI_IMAGE_MODEL = "custom-model";
    const fetchMock = mockFetchOnce(404, { error: { status: "NOT_FOUND" } });
    await expect(geminiColorize({ image: Buffer.from([1]), mime: "image/jpeg" })).rejects.toMatchObject({
      code: "GEMINI_IMAGE_FAILED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("closestGeminiAspectRatio picks the nearest accepted ratio, null when unknown", () => {
    expect(closestGeminiAspectRatio(100, 100)).toBe("1:1");
    expect(closestGeminiAspectRatio(300, 200)).toBe("3:2");
    expect(closestGeminiAspectRatio(200, 300)).toBe("2:3");
    expect(closestGeminiAspectRatio(1600, 900)).toBe("16:9");
    expect(closestGeminiAspectRatio(undefined, 100)).toBeNull();
    expect(closestGeminiAspectRatio(0, 100)).toBeNull();
  });

  it("throws AI_NOT_CONFIGURED without a key (route maps it to the browser fallback)", async () => {
    delete process.env.GEMINI_API_KEY;
    expect(geminiImageConfigured()).toBe(false);
    await expect(geminiColorize({ image: Buffer.from([1]), mime: "image/jpeg" })).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
    });
  });

  it("marks 429 as retryable and 503 as overloaded", async () => {
    mockFetchOnce(429, { error: { message: "quota" } });
    const rateErr = await geminiColorize({ image: Buffer.from([1]), mime: "image/jpeg" }).catch((e) => e);
    expect(rateErr).toBeInstanceOf(AiError);
    expect(rateErr.rateLimited).toBe(true);
    mockFetchOnce(503, { error: { message: "overloaded" } });
    await expect(geminiColorize({ image: Buffer.from([1]), mime: "image/jpeg" })).rejects.toMatchObject({
      code: "GEMINI_IMAGE_OVERLOADED",
    });
  });

  it("throws NO_OUTPUT when the response has no image part", async () => {
    mockFetchOnce(200, { candidates: [{ content: { parts: [{ text: "I cannot do that." }] } }] });
    await expect(geminiColorize({ image: Buffer.from([1]), mime: "image/jpeg" })).rejects.toMatchObject({
      code: "GEMINI_IMAGE_NO_OUTPUT",
    });
  });

  it("pickImagePart scans parts and ignores text", () => {
    expect(pickImagePart([{ text: "hi" }])).toBeNull();
    expect(pickImagePart([{ inlineData: { mimeType: "image/png", data: FAKE_PNG_B64 } }])).toEqual({
      mimeType: "image/png",
      data: FAKE_PNG_B64,
    });
    expect(pickImagePart(null)).toBeNull();
  });
});
