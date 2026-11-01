// Replicate adapter: async predictions for image models.
//
// Model slugs and version hashes come from ENV VARIABLES ONLY — never
// hardcoded here (P0 fix). When a model env var is empty, that
// capability is unconfigured and callers must fall back honestly.
//   REPLICATE_COLORIZE_MODEL / _VERSION  (reference: DDColor-style colorizer)
//   REPLICATE_UPSCALE_MODEL / _VERSION   (reference: Real-ESRGAN-style upscaler)
//   REPLICATE_RESTORE_MODEL / _VERSION   (reference: GFPGAN-style face restore)
// Keys come from the image pool (lib/ai-pool.ts): AI_API_KEYS
// (comma-separated, round-robin + failover) with legacy
// REPLICATE_API_TOKEN appended. This adapter never reads keys itself —
// callers pass the key the pool selected, so failover actually rotates.
// - SSRF guard: model outputs are fetched ONLY from replicate.delivery.
// - Cost: Replicate bills per second of GPU time (Oct 2026 hardware
//   rates: T4 $0.000225/s, L40S $0.000975/s, A100 $0.0014/s, H100
//   $0.001525/s). Estimates here use the T4 rate against the
//   prediction's own predict_time and are labelled estimates, because
//   the API does not report which hardware ran the job.
// - Error messages here are INTERNAL ONLY (server logs): routes map
//   every failure to a generic user-facing message, so no provider
//   name, model slug, or env var name ever reaches a client.

import { AiError } from "../types";

const BASE = "https://api.replicate.com/v1";

/** Model slugs from env only — "" means that capability is unconfigured. */
export function colorizeModel(): string {
  return (process.env.REPLICATE_COLORIZE_MODEL ?? "").trim();
}
export function upscaleModel(): string {
  return (process.env.REPLICATE_UPSCALE_MODEL ?? "").trim();
}
export function restoreModel(): string {
  return (process.env.REPLICATE_RESTORE_MODEL ?? "").trim();
}
export function colorizeVersion(): string {
  return (process.env.REPLICATE_COLORIZE_VERSION ?? "").trim();
}
export function upscaleVersion(): string {
  return (process.env.REPLICATE_UPSCALE_VERSION ?? "").trim();
}
export function restoreVersion(): string {
  return (process.env.REPLICATE_RESTORE_VERSION ?? "").trim();
}

/** T4 hardware rate, $/second — used ONLY for cost estimates. */
export const REPLICATE_T4_RATE_PER_SECOND = 0.000225;


export interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: unknown;
  error?: unknown;
  metrics?: { predict_time?: number };
}

function modelEndpoint(model: string, version: string): string {
  if (version) return `${BASE}/models/${model}/versions/${version}/predictions`;
  return `${BASE}/models/${model}/predictions`;
}

/** Start an async prediction. Returns the prediction id immediately. */
export async function replicateStart(
  opts: {
    model: string;
    version?: string;
    input: Record<string, unknown>;
  },
  key: string
): Promise<string> {
  const res = await fetch(modelEndpoint(opts.model, opts.version ?? ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: opts.input }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  if (!res) throw new AiError("REPLICATE_FAILED", "Could not reach the image service.", 502);
  if (res.status === 429) {
    throw new AiError("REPLICATE_RATE_LIMITED", "The image service is rate limited right now.", 429, true);
  }
  if (res.status === 401 || res.status === 402) {
    throw new AiError("REPLICATE_AUTH", "The image service rejected the request.", res.status);
  }
  if (res.status === 404) {
    throw new AiError("REPLICATE_NOT_FOUND", "The image service could not find that job.", 404);
  }
  if (!res.ok) {
    throw new AiError("REPLICATE_FAILED", "The image service could not start that job.", 502);
  }
  const data = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!data?.id) throw new AiError("REPLICATE_FAILED", "The image service did not return a job id.", 502);
  return data.id;
}

/** Check a prediction's status (fast, no output download). */
export async function replicateGet(predictionId: string, key: string): Promise<ReplicatePrediction> {
  const res = await fetch(`${BASE}/predictions/${predictionId}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!res) throw new AiError("REPLICATE_FAILED", "Could not reach the image service.", 502);
  if (res.status === 429) {
    throw new AiError("REPLICATE_RATE_LIMITED", "The image service is rate limited right now.", 429, true);
  }
  if (res.status === 401 || res.status === 402) {
    throw new AiError("REPLICATE_AUTH", "The image service rejected the request.", res.status);
  }
  if (res.status === 404) {
    throw new AiError("REPLICATE_NOT_FOUND", "The image service could not find that job.", 404);
  }
  if (!res.ok) throw new AiError("REPLICATE_FAILED", "The image service job lookup failed.", 502);
  const data = (await res.json().catch(() => null)) as ReplicatePrediction | null;
  if (!data?.id) throw new AiError("REPLICATE_FAILED", "The image service returned an unknown job.", 502);
  return data;
}

/** Extract the single output URL from a succeeded prediction. */
export function replicateOutputUrl(pred: ReplicatePrediction): string | null {
  const out = pred.output;
  const url = Array.isArray(out) ? out[out.length - 1] : typeof out === "string" ? out : null;
  return typeof url === "string" ? url : null;
}

/** Fetch a model output. ONLY replicate.delivery hosts are allowed. */
export async function replicateFetchOutput(url: string): Promise<Buffer> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AiError("REPLICATE_BAD_OUTPUT", "Replicate returned an unusable output link.", 502);
  }
  if (
    parsed.protocol !== "https:" ||
    (parsed.hostname !== "replicate.delivery" && !parsed.hostname.endsWith(".replicate.delivery"))
  ) {
    throw new AiError("REPLICATE_BAD_OUTPUT", "The image service returned an output from an unexpected host.", 502);
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) }).catch(() => null);
  if (!res || !res.ok) throw new AiError("REPLICATE_FAILED", "Could not download the image service result.", 502);
  return Buffer.from(await res.arrayBuffer());
}

/** Cost estimate from a prediction's own predict_time (T4 rate). */
export function replicateCostEstimate(pred: ReplicatePrediction): number {
  const seconds = pred.metrics?.predict_time;
  if (typeof seconds !== "number" || seconds <= 0) return 0.01;
  return Math.round(seconds * REPLICATE_T4_RATE_PER_SECOND * 10000) / 10000;
}
