// Gemini text-to-image adapter (Nano Banana family).
//
// Reuses the image-model selection and response parsing of the
// colorize adapter (lib/ai/adapters/gemini-image.ts): primary
// gemini-nano-banana-2.1, cheapest 1K fallback
// gemini-3.1-flash-lite-image on a 404 only when the model was NOT
// overridden in env. The only difference from colorize is the
// request: text prompt only, no input image — generateContent with
// responseModalities TEXT+IMAGE returns the generated image as
// inline base64 (the same shape the colorize adapter parses).
//
// PAID ONLY: Gemini image models have no free tier (official
// pricing). Every call bills the owner's Gemini account, which is
// why the route gates generation behind sign-in + daily budget.
// Cost estimate per 1K image: $0.041 (see GEMINI_IMAGE_COST_PER_IMAGE).
//
// Error messages here are INTERNAL ONLY (server logs): routes map
// every failure to a generic user-facing message, so no provider
// name, model slug, or env var name ever reaches a client.

import { AiError } from "../types";
import {
  GEMINI_IMAGE_COST_PER_IMAGE,
  geminiImageFallbackModel,
  geminiImageModel,
  geminiImageModelOverridden,
  pickImagePart,
} from "../adapters/gemini-image";
import { GENERATE_SIZE_MAP, type GenerateResult, type GenerateSize } from "./types";

export { GEMINI_IMAGE_COST_PER_IMAGE };

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiGenerateConfigured(): boolean {
  return Boolean((process.env.GEMINI_API_KEY ?? "").trim());
}

/**
 * Generate one image from a text prompt. Returns raw image bytes
 * plus the model that actually produced them. Throws AiError:
 * AI_NOT_CONFIGURED (no key), GEMINI_IMAGE_RATE_LIMITED (429),
 * GEMINI_IMAGE_OVERLOADED (503), or GEMINI_IMAGE_FAILED /
 * GEMINI_IMAGE_NO_OUTPUT (other failures). Timeout default 45s so
 * the route still fits the 60s serverless limit.
 */
export async function geminiGenerateImage(opts: {
  prompt: string;
  size: GenerateSize;
  timeoutMs?: number;
}): Promise<GenerateResult> {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) throw new AiError("AI_NOT_CONFIGURED", "Gemini is not configured.", 503);
  const primary = geminiImageModel();
  const models = geminiImageModelOverridden() ? [primary] : [primary, geminiImageFallbackModel()];
  let lastError: AiError | null = null;
  for (const model of models) {
    const url = `${BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: opts.prompt }] }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
              imageSize: "1K",
              aspectRatio: GENERATE_SIZE_MAP[opts.size].geminiAspect,
            },
          },
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 45000),
      });
    } catch {
      throw new AiError("GEMINI_IMAGE_FAILED", "Could not reach Gemini.", 502);
    }
    const json = (await res.json().catch(() => null)) as {
      candidates?: Array<{ content?: { parts?: unknown } }>;
      error?: { message?: string; status?: string };
    } | null;
    if (res.status === 429) {
      throw new AiError("GEMINI_IMAGE_RATE_LIMITED", "Gemini is rate limited right now.", 429, true);
    }
    if (res.status === 503) {
      throw new AiError("GEMINI_IMAGE_OVERLOADED", "Gemini is overloaded right now.", 503);
    }
    if (res.status === 404 && model !== models[models.length - 1]) {
      lastError = new AiError("GEMINI_IMAGE_FAILED", "Gemini did not return a usable image.", 502);
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      throw new AiError("GEMINI_IMAGE_FAILED", "Gemini did not return a usable image.", 502);
    }
    const image = pickImagePart(json?.candidates?.[0]?.content?.parts);
    if (!image) {
      throw new AiError("GEMINI_IMAGE_NO_OUTPUT", "Gemini returned no image.", 502);
    }
    return { buffer: Buffer.from(image.data, "base64"), mime: image.mimeType, provider: "gemini", model };
  }
  throw lastError ?? new AiError("GEMINI_IMAGE_FAILED", "Gemini did not return a usable image.", 502);
}
