// Image-provider key pool + provider interface (P0 fix).
//
// AI_API_KEYS is the IMAGE-provider key pool: a comma-separated list of
// image-model API keys (Replicate tokens first). The legacy single key
// REPLICATE_API_TOKEN is appended when it is not already listed, so
// existing setups keep working. Keys rotate round-robin, and on a
// retryable failure (429/401/402/5xx) the call automatically retries
// with the NEXT key (failover) instead of failing the user's job.
//
// HARD BOUNDARY: only image-provider keys live here. The LLM/text keys
// (Groq, Gemini, OpenRouter, NVIDIA, ElevenLabs) are NEVER read here —
// they cannot colorize, upscale, or restore images, and feeding them
// to image jobs would only leak them into the wrong calls. Text keys
// stay in the Phase 0 router; image keys stay in this pool.
//
// The pool is server-only. Key values are never logged, never returned
// to any client, and never appear in any error message: callers map
// pool failures to generic user-facing text.
//
// Provider interface: other image providers plug in later by adding
// one object to imageProviders — routes call the interface, never a
// single provider's functions directly.

import { AiError } from "./ai/types";
import {
  colorizeModel,
  colorizeVersion,
  replicateCostEstimate,
  replicateFetchOutput,
  replicateGet,
  replicateOutputUrl,
  replicateStart,
  restoreModel,
  restoreVersion,
  upscaleModel,
  upscaleVersion,
  type ReplicatePrediction,
} from "./ai/adapters/replicate";

/** All configured image-provider keys, in pool order (deduped). */
export function imageApiKeys(): string[] {
  const out: string[] = [];
  const raw = process.env.AI_API_KEYS ?? "";
  for (const part of raw.split(",")) {
    const key = part.trim();
    if (key && !out.includes(key)) out.push(key);
  }
  const legacy = (process.env.REPLICATE_API_TOKEN ?? "").trim();
  if (legacy && !out.includes(legacy)) out.push(legacy);
  return out;
}

/** True when at least one image-provider key is configured. */
export function imagePoolConfigured(): boolean {
  return imageApiKeys().length > 0;
}

const RETRYABLE_STATUSES = new Set([401, 402, 429, 500, 502, 503, 504]);

function isRetryable(err: unknown, retry404: boolean): boolean {
  if (err instanceof AiError) {
    if (err.rateLimited) return true;
    if (RETRYABLE_STATUSES.has(err.status)) return true;
    if (retry404 && err.status === 404) return true;
  }
  return false;
}

// Module-level round-robin cursor. Serverless instances each hold
// their own cursor, so rotation is best-effort per instance — the
// failover loop below is what guarantees a bad key never kills a job.
let cursor = 0;

/**
 * Run fn with image keys in round-robin order, failing over to the
 * next key on retryable errors. Non-retryable errors (e.g. a 400 for
 * a bad input) throw immediately without burning the whole pool.
 * Throws AI_NOT_CONFIGURED when the pool is empty.
 */
export async function runWithImageKeys<T>(
  fn: (key: string) => Promise<T>,
  opts: { retry404?: boolean } = {}
): Promise<T> {
  const keys = imageApiKeys();
  if (keys.length === 0) {
    throw new AiError("AI_NOT_CONFIGURED", "No image-provider key is configured.", 503);
  }
  const start = cursor++ % keys.length;
  let lastErr: unknown = null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    try {
      return await fn(key);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err, opts.retry404 ?? false)) throw err;
      // Otherwise fall through to the next key.
    }
  }
  throw lastErr ?? new AiError("IMAGE_FAILED", "The image service could not start that job.", 502);
}

/** Common interface for an image model provider (colorize/upscale/restore). */
export interface ImageModelProvider {
  id: "replicate";
  /** Model slugs come from ENV ONLY — never hardcoded here. */
  colorizeModel(): string;
  upscaleModel(): string;
  restoreModel(): string;
  startColorize(image: Buffer): Promise<string>;
  startUpscale(image: Buffer, scale: 2 | 4, faceEnhance: boolean): Promise<string>;
  startRestore(image: Buffer): Promise<string>;
  getPrediction(predictionId: string): Promise<ReplicatePrediction>;
  outputUrl(pred: ReplicatePrediction): string | null;
  fetchOutput(url: string): Promise<Buffer>;
  costEstimate(pred: ReplicatePrediction): number;
}

function toDataUri(image: Buffer): string {
  return `data:image/jpeg;base64,${image.toString("base64")}`;
}

/**
 * The Replicate image provider. Model slugs/versions are read from env
 * at call time (see lib/ai/adapters/replicate.ts): when a model env var
 * is empty, that capability is unconfigured and the caller must fall
 * back honestly instead of calling with a guessed slug.
 */
export const replicateImageProvider: ImageModelProvider = {
  id: "replicate",
  colorizeModel,
  upscaleModel,
  restoreModel,
  async startColorize(image: Buffer): Promise<string> {
    const model = colorizeModel();
    if (!model) throw new AiError("AI_NOT_CONFIGURED", "No colorize model is configured.", 503);
    return runWithImageKeys((key) =>
      replicateStart({ model, version: colorizeVersion(), input: { image: toDataUri(image), model_size: "large" } }, key)
    );
  },
  async startUpscale(image: Buffer, scale: 2 | 4, faceEnhance: boolean): Promise<string> {
    const model = upscaleModel();
    if (!model) throw new AiError("AI_NOT_CONFIGURED", "No upscale model is configured.", 503);
    return runWithImageKeys((key) =>
      replicateStart(
        { model, version: upscaleVersion(), input: { image: toDataUri(image), scale, face_enhance: faceEnhance } },
        key
      )
    );
  },
  async startRestore(image: Buffer): Promise<string> {
    const model = restoreModel();
    if (!model) throw new AiError("AI_NOT_CONFIGURED", "No restore model is configured.", 503);
    // tencentarc/gfpgan Cog inputs (public docs; token-verified schema
    // is still owed — a wrong key surfaces as an honest job failure,
    // never a fake result): img + version + scale.
    return runWithImageKeys((key) =>
      replicateStart(
        { model, version: restoreVersion(), input: { img: toDataUri(image), version: "v1.4", scale: 2 } },
        key
      )
    );
  },
  async getPrediction(predictionId: string): Promise<ReplicatePrediction> {
    // retry404: a prediction created under one pool key is invisible
    // to another account's key, so polling tries each key in turn.
    return runWithImageKeys((key) => replicateGet(predictionId, key), { retry404: true });
  },
  outputUrl(pred: ReplicatePrediction): string | null {
    return replicateOutputUrl(pred);
  },
  async fetchOutput(url: string): Promise<Buffer> {
    return replicateFetchOutput(url);
  },
  costEstimate(pred: ReplicatePrediction): number {
    return replicateCostEstimate(pred);
  },
};

/** All image providers, in preference order. Today: Replicate only. */
export const imageProviders: ImageModelProvider[] = [replicateImageProvider];

/** First available image provider, or null when no key is configured. */
export function getImageProvider(): ImageModelProvider | null {
  if (!imagePoolConfigured()) return null;
  return imageProviders[0] ?? null;
}
