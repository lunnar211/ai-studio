// Google Gemini image adapter: Nano Banana colorize (image-to-image).
//
// Nano Banana is the community name for Gemini's image models. The
// current primary is gemini-nano-banana-2.1 (1K/2K/4K output); the
// cheapest 1K fallback is gemini-3.1-flash-lite-image. The older
// gemini-2.5-flash-image is LEGACY on Google's own model page and
// must not be pinned as a default (deep-research correction
// 2026-11-01); gemini-3.1-flash-image is previous-gen/deprecated.
// It takes an image + a text instruction and returns an edited
// image as inline base64 in the generateContent response — no
// prediction id, no polling: one synchronous call, so the
// photo-job poller runs it on the first COLORIZING poll and flows
// straight into the shared LAB-merge (original L + model a/b),
// exactly like the Space and image-pool tiers. Styles/eras are NOT
// in the prompt: the merge applies them afterwards, so the model
// can never invent detail.
//
// Env (server-only, never shipped to the browser):
//   GEMINI_API_KEY       — the owner's Gemini API key (same key the
//                          text/vision adapter uses; it becomes live
//                          only after the owner pastes it into Vercel
//                          and redeploys).
//   GEMINI_IMAGE_MODEL   — override, default gemini-nano-banana-2.1.
//                          When an override is set it is used exactly
//                          (no fallback): the owner chose it.
//
// Cost (owner's bill, NOT user credits): image output is billed
// per image — 2.1 at 1K is $0.0336/image plus a small thinking
// charge (~$0.006–$0.011), so GEMINI_IMAGE_COST_PER_IMAGE records
// $0.041 as the typical 1K job cost estimate; the real bill is
// Google's. Because this tier costs money per photo, the tier
// order tries the free Space first — Gemini only runs when the
// Space is unconfigured or failed (see lib/ai/tiers.ts).
//
// Error messages here are INTERNAL ONLY (server logs): routes map
// every failure to a generic user-facing message, so no provider
// name, model slug, or env var name ever reaches a client.

import { AiError } from "../types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Image model slug from env only — override without a code change. */
export function geminiImageModel(): string {
  return (process.env.GEMINI_IMAGE_MODEL ?? "").trim() || "gemini-nano-banana-2.1";
}

/** True when the owner overrode the model in env (fallback is then disabled: the owner chose it). */
export function geminiImageModelOverridden(): boolean {
  return Boolean((process.env.GEMINI_IMAGE_MODEL ?? "").trim());
}

/** Cheapest 1K fallback, used only when the default primary 404s (retired/renamed). */
export function geminiImageFallbackModel(): string {
  return "gemini-3.1-flash-lite-image";
}

/** True when the key is present. The poller treats a missing key as "tier skipped", never as a crash. */
export function geminiImageConfigured(): boolean {
  return Boolean((process.env.GEMINI_API_KEY ?? "").trim());
}

/** Marker stored as the job's predictionId while a Gemini job waits for its first poll. */
export const GEMINI_PENDING_PREDICTION_ID = "gemini:pending";

/** Output-price estimate per image, USD — recorded as the job's cost estimate. */
export const GEMINI_IMAGE_COST_PER_IMAGE = 0.041;

/** Gemini image aspect ratios the API accepts (imageConfig.aspectRatio). */
const GEMINI_ASPECT_RATIOS: Array<{ label: string; value: number }> = [
  { label: "1:1", value: 1 },
  { label: "2:3", value: 2 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "3:4", value: 3 / 4 },
  { label: "4:3", value: 4 / 3 },
  { label: "4:5", value: 4 / 5 },
  { label: "5:4", value: 5 / 4 },
  { label: "9:16", value: 9 / 16 },
  { label: "16:9", value: 16 / 9 },
  { label: "21:9", value: 21 / 9 },
];

/**
 * Closest accepted Gemini aspect ratio for input dimensions, or
 * null when the dimensions are missing/invalid (caller then omits
 * aspectRatio and the model picks its own — never force square:
 * a forced square squashes the photo).
 */
export function closestGeminiAspectRatio(width: unknown, height: unknown): string | null {
  if (typeof width !== "number" || typeof height !== "number" || !width || !height) return null;
  const ratio = width / height;
  let best = GEMINI_ASPECT_RATIOS[0];
  let bestDist = Math.abs(Math.log(ratio / best.value));
  for (const r of GEMINI_ASPECT_RATIOS.slice(1)) {
    const d = Math.abs(Math.log(ratio / r.value));
    if (d < bestDist) {
      best = r;
      bestDist = d;
    }
  }
  return best.label;
}

/**
 * Colorize instruction. Deliberately narrow: add natural, realistic
 * colour appropriate to the photo's era and content, and change
 * NOTHING else — no new objects, no changed faces, no recomposition.
 * The LAB merge afterwards keeps the original luminance anyway, so
 * even if the model shifts shading, detail stays original.
 */
export const GEMINI_COLORIZE_PROMPT =
  "Colorize this black-and-white photograph with natural, realistic colors " +
  "appropriate to its era, setting, and content. Keep every person, face, " +
  "object, texture, and detail exactly the same — only add color. Do not " +
  "change the composition, do not add or remove anything, do not sharpen " +
  "or smooth anything, and do not make it look like a modern digital photo. " +
  "Return only the colorized image.";

interface GeminiImagePart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

/** Find the first image part in a generateContent response, or null. */
export function pickImagePart(parts: unknown): { mimeType: string; data: string } | null {
  if (!Array.isArray(parts)) return null;
  for (const p of parts as GeminiImagePart[]) {
    if (p?.inlineData?.data) return { mimeType: p.inlineData.mimeType ?? "image/png", data: p.inlineData.data };
  }
  return null;
}

/**
 * Run Nano Banana colorize synchronously. Returns the model's raw
 * image bytes (the caller LAB-merges them onto the original) plus
 * the model that actually produced it (primary, or the Lite
 * fallback when the primary 404s). Throws AiError:
 * AI_NOT_CONFIGURED (no key), GEMINI_IMAGE_RATE_LIMITED
 * (429, retryable), GEMINI_IMAGE_OVERLOADED (503, retryable), or
 * GEMINI_IMAGE_FAILED / GEMINI_IMAGE_NO_OUTPUT (other failures).
 * Timeout default 45s: the poll request must still fit the 60s
 * serverless limit with the merge + finalize after it.
 * A failed call produces no image, so a fallback retry after a
 * 404 never double-bills; 429/503 throw at once (the client
 * retries later) instead of burning a second model call.
 */
export async function geminiColorize(opts: {
  image: Buffer;
  mime: string;
  timeoutMs?: number;
  /** Gemini aspect-ratio label (see closestGeminiAspectRatio); omitted when unknown. */
  aspectRatio?: string;
}): Promise<{ buffer: Buffer; mime: string; model: string }> {
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
          contents: [
            {
              parts: [
                { text: GEMINI_COLORIZE_PROMPT },
                { inlineData: { mimeType: opts.mime, data: opts.image.toString("base64") } },
              ],
            },
          ],
          // Ask for image output (plus any short text the model wants to
          // attach); pickImagePart scans all parts for the image.
          // imageSize 1K is the cheapest output; aspectRatio matches
          // the input photo so the model never squashes it square.
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
              imageSize: "1K",
              ...(opts.aspectRatio ? { aspectRatio: opts.aspectRatio } : {}),
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
      // Primary retired/renamed: try the fallback once, no output billed.
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
    return { buffer: Buffer.from(image.data, "base64"), mime: image.mimeType, model };
  }
  throw lastError ?? new AiError("GEMINI_IMAGE_FAILED", "Gemini did not return a usable image.", 502);
}
