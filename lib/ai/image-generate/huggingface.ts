// Hugging Face text-to-image adapter — DISABLED by design.
//
// The owner's stored Hugging Face token returns 401 (verified
// 2026-11-01, twice, and again 2026-11-02 for the image key
// inventory). This adapter therefore fails closed in every normal
// configuration: it runs ONLY when ALL THREE are true —
//   HF_ENABLED=true (the repo's existing HF opt-in flag, same as
//   the text/vision HF adapter),
//   HF_TOKEN is present,
//   HF_IMAGE_MODEL names a model (no default is pinned: the owner
//   must choose one when enabling; HF's own first-call guide uses
//   black-forest-labs/FLUX.1-schnell as its example).
// Until then the chain skips this provider entirely (see chain.ts),
// so a disabled HF can never block or fake a generation.
//
// When (and only when) enabled, the call shape follows HF's own
// Inference Providers docs: POST
// https://router.huggingface.co/hf-inference/models/{model} with
// Authorization: Bearer <token> and { inputs: prompt }; the
// response body IS the image bytes. This endpoint was verified
// from docs only — it has never been live-called here (the token
// is invalid), so the first real enablement must be verified by
// its first real call before being trusted.
//
// Error messages here are INTERNAL ONLY (server logs).

import { AiError } from "../types";
import { huggingfaceDisabled } from "../adapters/huggingface";
import type { GenerateResult, GenerateSize } from "./types";

const ROUTER_BASE = "https://router.huggingface.co/hf-inference/models";

/** True only when the owner has explicitly opted HF back in. */
export function hfImageGenerationEnabled(): boolean {
  return process.env.HF_ENABLED === "true";
}

/** Model slug from env only — deliberately NO default: the owner must choose one when enabling. */
export function hfImageModel(): string {
  return (process.env.HF_IMAGE_MODEL ?? "").trim();
}

/** True when HF could even be attempted (flag + token + model). */
export function hfGenerateConfigured(): boolean {
  return (
    hfImageGenerationEnabled() &&
    Boolean((process.env.HF_TOKEN ?? "").trim()) &&
    Boolean(hfImageModel())
  );
}

/**
 * Generate one image via HF Inference Providers. In every normal
 * configuration this throws HF_DISABLED (503) without touching the
 * network — the chain treats that as "provider skipped". Throws
 * AiError: HF_DISABLED, AI_NOT_CONFIGURED (flag on but token or
 * model missing), HF_AUTH (401/403), HF_FAILED / HF_NO_OUTPUT.
 */
export async function hfGenerateImage(opts: {
  prompt: string;
  size: GenerateSize;
  timeoutMs?: number;
}): Promise<GenerateResult> {
  if (!hfImageGenerationEnabled()) throw huggingfaceDisabled();
  const token = (process.env.HF_TOKEN ?? "").trim();
  const model = hfImageModel();
  if (!token || !model) {
    throw new AiError("AI_NOT_CONFIGURED", "Hugging Face is not configured.", 503);
  }
  // Size is accepted for interface parity with the other adapters;
  // HF text-to-image takes no size parameter — the model decides
  // its own output size, so the request carries the prompt only.
  void opts.size;
  let res: Response;
  try {
    res = await fetch(`${ROUTER_BASE}/${model}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ inputs: opts.prompt }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 45000),
    });
  } catch {
    throw new AiError("HF_FAILED", "Could not reach Hugging Face.", 502);
  }
  if (res.status === 401 || res.status === 403) {
    throw new AiError("HF_AUTH", "Hugging Face rejected the token.", 503);
  }
  if (res.status === 429) {
    throw new AiError("HF_RATE_LIMITED", "Hugging Face is rate limited right now.", 429, true);
  }
  if (!res.ok) {
    throw new AiError("HF_FAILED", "Hugging Face did not return a usable image.", 502);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0) {
    throw new AiError("HF_NO_OUTPUT", "Hugging Face returned an empty image.", 502);
  }
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  return { buffer: bytes, mime, provider: "huggingface", model };
}
