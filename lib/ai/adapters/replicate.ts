// Replicate adapter: async predictions for image models.
//
// Verified facts (2026-11-01):
// - piddnad/ddcolor EXISTS on Replicate (model page live). Its Cog
//   interface takes `image` (required) + `model_size` ("large"/"tiny",
//   default "large"). The exact pinned version hash could not be
//   fetched without an API token, so the code calls the unversioned
//   model endpoint (same pattern the existing Real-ESRGAN code uses),
//   which runs the model's current version. The owner can pin a version
//   later via REPLICATE_COLORIZE_VERSION.
// - nightmareai/real-esrgan (already in use) takes
//   { image, scale, face_enhance } — face_enhance is the GFPGAN-based
//   face path inside that model, so the "face enhance" toggle maps to
//   it directly; no separate GFPGAN model is wired.
// - The instruction-based "colour hints" model is NOT wired: no hint
//   model has been verified or configured. It stays off until the owner
//   sets REPLICATE_HINT_MODEL to a verified model slug.
// - SSRF guard: model outputs are fetched ONLY from replicate.delivery.
// - Cost: Replicate bills per second of GPU time (Oct 2026 hardware
//   rates: T4 $0.000225/s, L40S $0.000975/s, A100 $0.0014/s, H100
//   $0.001525/s). Estimates here use the T4 rate against the
//   prediction's own predict_time and are labelled estimates, because
//   the API does not report which hardware ran the job.

import { AiError } from "../types";

const BASE = "https://api.replicate.com/v1";

export const REPLICATE_COLORIZE_MODEL =
  process.env.REPLICATE_COLORIZE_MODEL || "piddnad/ddcolor";
export const REPLICATE_UPSCALE_MODEL =
  process.env.REPLICATE_UPSCALE_MODEL || "nightmareai/real-esrgan";
export const REPLICATE_HINT_MODEL = process.env.REPLICATE_HINT_MODEL || "";
export const REPLICATE_COLORIZE_VERSION = process.env.REPLICATE_COLORIZE_VERSION || "";
export const REPLICATE_UPSCALE_VERSION = process.env.REPLICATE_UPSCALE_VERSION || "";

/** T4 hardware rate, $/second — used ONLY for cost estimates. */
export const REPLICATE_T4_RATE_PER_SECOND = 0.000225;

function token(): string {
  const t = process.env.REPLICATE_API_TOKEN;
  if (!t) throw new AiError("AI_NOT_CONFIGURED", "Replicate is not configured.", 503);
  return t;
}

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
export async function replicateStart(opts: {
  model: string;
  version?: string;
  input: Record<string, unknown>;
}): Promise<string> {
  const res = await fetch(modelEndpoint(opts.model, opts.version ?? ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: opts.input }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  if (!res) throw new AiError("REPLICATE_FAILED", "Could not reach Replicate.", 502);
  if (res.status === 429) {
    throw new AiError("REPLICATE_RATE_LIMITED", "Replicate is rate limited right now. Please try again shortly.", 429, true);
  }
  if (!res.ok) {
    throw new AiError("REPLICATE_FAILED", "Replicate could not start that job.", 502);
  }
  const data = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!data?.id) throw new AiError("REPLICATE_FAILED", "Replicate did not return a job id.", 502);
  return data.id;
}

/** Check a prediction's status (fast, no output download). */
export async function replicateGet(predictionId: string): Promise<ReplicatePrediction> {
  const res = await fetch(`${BASE}/predictions/${predictionId}`, {
    headers: { Authorization: `Bearer ${token()}` },
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!res) throw new AiError("REPLICATE_FAILED", "Could not reach Replicate.", 502);
  if (res.status === 429) {
    throw new AiError("REPLICATE_RATE_LIMITED", "Replicate is rate limited right now.", 429, true);
  }
  if (!res.ok) throw new AiError("REPLICATE_FAILED", "Replicate job lookup failed.", 502);
  const data = (await res.json().catch(() => null)) as ReplicatePrediction | null;
  if (!data?.id) throw new AiError("REPLICATE_FAILED", "Replicate returned an unknown job.", 502);
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
    throw new AiError("REPLICATE_BAD_OUTPUT", "Replicate returned an output from an unexpected host.", 502);
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) }).catch(() => null);
  if (!res || !res.ok) throw new AiError("REPLICATE_FAILED", "Could not download the Replicate result.", 502);
  return Buffer.from(await res.arrayBuffer());
}

/** Cost estimate from a prediction's own predict_time (T4 rate). */
export function replicateCostEstimate(pred: ReplicatePrediction): number {
  const seconds = pred.metrics?.predict_time;
  if (typeof seconds !== "number" || seconds <= 0) return 0.01;
  return Math.round(seconds * REPLICATE_T4_RATE_PER_SECOND * 10000) / 10000;
}
