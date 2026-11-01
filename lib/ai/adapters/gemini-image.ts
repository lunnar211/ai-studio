// Google Gemini image adapter: Nano Banana colorize (image-to-image).
//
// Nano Banana is the community name for Gemini 2.5 Flash Image
// (stable model code gemini-2.5-flash-image). It takes an image +
// a text instruction and returns an edited image as inline base64
// in the generateContent response — no prediction id, no polling:
// one synchronous call, so the photo-job poller runs it on the
// first COLORIZING poll and flows straight into the shared
// LAB-merge (original L + model a/b), exactly like the Space and
// image-pool tiers. Styles/eras are NOT in the prompt: the merge
// applies them afterwards, so the model can never invent detail.
//
// Env (server-only, never shipped to the browser):
//   GEMINI_API_KEY       — the owner's Gemini API key (same key the
//                          text/vision adapter uses; it becomes live
//                          only after the owner pastes it into Vercel
//                          and redeploys).
//   GEMINI_IMAGE_MODEL   — override, default gemini-2.5-flash-image.
//
// Cost (owner's bill, NOT user credits): image output is billed
// per image — about $0.039 per 1024px-class image at the standard
// rate (1,290 output tokens x $30/1M), plus a fraction of a cent
// of input tokens. GEMINI_IMAGE_COST_PER_IMAGE records the output
// price as the job's cost estimate; the real bill is Google's.
// Because this tier costs money per photo, the tier order tries
// the free Space first — Gemini only runs when the Space is
// unconfigured or failed (see lib/ai/tiers.ts).
//
// Error messages here are INTERNAL ONLY (server logs): routes map
// every failure to a generic user-facing message, so no provider
// name, model slug, or env var name ever reaches a client.

import { AiError } from "../types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Image model slug from env only — override without a code change. */
export function geminiImageModel(): string {
  return (process.env.GEMINI_IMAGE_MODEL ?? "").trim() || "gemini-2.5-flash-image";
}

/** True when the key is present. The poller treats a missing key as "tier skipped", never as a crash. */
export function geminiImageConfigured(): boolean {
  return Boolean((process.env.GEMINI_API_KEY ?? "").trim());
}

/** Marker stored as the job's predictionId while a Gemini job waits for its first poll. */
export const GEMINI_PENDING_PREDICTION_ID = "gemini:pending";

/** Output-price estimate per image, USD — recorded as the job's cost estimate. */
export const GEMINI_IMAGE_COST_PER_IMAGE = 0.039;

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
 * image bytes (the caller LAB-merges them onto the original).
 * Throws AiError: AI_NOT_CONFIGURED (no key), GEMINI_IMAGE_RATE_LIMITED
 * (429, retryable), GEMINI_IMAGE_OVERLOADED (503, retryable), or
 * GEMINI_IMAGE_FAILED / GEMINI_IMAGE_NO_OUTPUT (other failures).
 * Timeout default 45s: the poll request must still fit the 60s
 * serverless limit with the merge + finalize after it.
 */
export async function geminiColorize(opts: {
  image: Buffer;
  mime: string;
  timeoutMs?: number;
}): Promise<{ buffer: Buffer; mime: string }> {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) throw new AiError("AI_NOT_CONFIGURED", "Gemini is not configured.", 503);
  const model = geminiImageModel();
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
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
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
  if (res.status < 200 || res.status >= 300) {
    throw new AiError("GEMINI_IMAGE_FAILED", "Gemini did not return a usable image.", 502);
  }
  const image = pickImagePart(json?.candidates?.[0]?.content?.parts);
  if (!image) {
    throw new AiError("GEMINI_IMAGE_NO_OUTPUT", "Gemini returned no image.", 502);
  }
  return { buffer: Buffer.from(image.data, "base64"), mime: image.mimeType };
}
