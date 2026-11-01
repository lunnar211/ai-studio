// Raster image generation fallback chain: Gemini -> fal.ai ->
// Hugging Face (only when HF is opted back in; see huggingface.ts).
//
// The order is fixed by the task, not by plan: Gemini first (the
// repo's established image model), fal.ai second (fast FLUX), HF
// last and only when enabled. Providers that are unconfigured or
// admin-disabled are SKIPPED, never retried as failures: a skipped
// provider costs nothing and cannot mask a real failure. Each
// attempted provider runs once; a failure moves to the next. If
// every attempted provider fails, the last error is thrown (a
// rate-limit error is preferred when one occurred, so the route
// can answer 429 honestly instead of a generic 502).
//
// Deliberately NOT in this chain, ever: Groq (text LLM), OpenRouter
// (its image API is paid-only; the owner's key is a free-text-tier
// key), NVIDIA (no usable image-generation model in its verified
// catalogue), ElevenLabs (voice), Brevo (email). Wiring any of
// them here would burn calls that cannot return an image.
//
// Error messages here are INTERNAL ONLY (server logs).

import { AiError } from "../types";
import { falGenerateConfigured, falGenerateImage } from "./fal";
import { geminiGenerateConfigured, geminiGenerateImage } from "./gemini";
import { hfGenerateConfigured, hfGenerateImage } from "./huggingface";
import type { GenerateRequest, GenerateResult } from "./types";

function toggleOn(settings: Record<string, string>, id: string): boolean {
  return settings[`ai.provider.${id}`] !== "false";
}

/** True when at least one chain provider could even be attempted. */
export function generateProvidersConfigured(settings: Record<string, string>): boolean {
  return (
    (geminiGenerateConfigured() && toggleOn(settings, "gemini")) ||
    (falGenerateConfigured() && toggleOn(settings, "fal")) ||
    (hfGenerateConfigured() && toggleOn(settings, "huggingface"))
  );
}

/**
 * Generate one image through the chain. Returns the first success.
 * Throws AI_NOT_CONFIGURED when nothing was attempted, otherwise
 * the last (or rate-limit) error from the attempted providers.
 */
export async function generateImage(
  req: GenerateRequest,
  settings: Record<string, string>
): Promise<GenerateResult> {
  const attempts: Array<{ provider: string; run: () => Promise<GenerateResult> }> = [];
  if (geminiGenerateConfigured() && toggleOn(settings, "gemini")) {
    attempts.push({
      provider: "gemini",
      run: () => geminiGenerateImage({ prompt: req.prompt, size: req.size }),
    });
  }
  if (falGenerateConfigured() && toggleOn(settings, "fal")) {
    attempts.push({
      provider: "fal",
      run: () => falGenerateImage({ prompt: req.prompt, size: req.size }),
    });
  }
  if (hfGenerateConfigured() && toggleOn(settings, "huggingface")) {
    attempts.push({
      provider: "huggingface",
      run: () => hfGenerateImage({ prompt: req.prompt, size: req.size }),
    });
  }
  if (attempts.length === 0) {
    throw new AiError("AI_NOT_CONFIGURED", "No image generation provider is configured.", 503);
  }
  let lastError: AiError | null = null;
  let rateLimitError: AiError | null = null;
  for (const attempt of attempts) {
    try {
      return await attempt.run();
    } catch (err) {
      const e = err instanceof AiError ? err : new AiError("GENERATE_FAILED", "Image generation failed.", 502);
      lastError = e;
      if (e.rateLimited) rateLimitError = e;
    }
  }
  throw rateLimitError ?? lastError ?? new AiError("GENERATE_FAILED", "Image generation failed.", 502);
}
