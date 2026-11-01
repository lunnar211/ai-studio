// fal.ai text-to-image adapter (queue API, FLUX.1 [schnell]).
//
// Shape verified against fal.ai's own Inference API docs (no model
// run was made — docs reads only):
//   Submit: POST https://queue.fal.run/{model} with
//     Authorization: Key <key> and { input: { prompt, image_size,
//     num_inference_steps, num_images, output_format } }.
//   The submit response carries request_id AND status_url /
//   response_url / cancel_url — the docs say NOT to build those
//   URLs by hand, so this adapter polls exactly the returned
//   status_url and fetches exactly the returned response_url.
//   Status values: IN_QUEUE, IN_PROGRESS, COMPLETED (a failed or
//   cancelled request also reports COMPLETED — the result tells
//   whether it succeeded).
//   Result: { data: { images: [{ url, width, height, ... }] } }.
//   The image bytes are then downloaded server-side so the client
//   never sees a fal URL and the route can return one shape for
//   every provider.
//
// Model: fal-ai/flux/schnell (fal.ai's own model page; 4 default
// steps, image_size enum square_hd/square/portrait_4_3/
// portrait_16_9/landscape_4_3/landscape_16_9). Env override
// FAL_IMAGE_MODEL wins exactly when set. FLUX.1 [schnell] is fast
// (4 steps) on purpose: the route must finish inside the 60s
// serverless limit, and a slow model would time out and possibly
// still bill (see the timeout note in falGenerateImage).
//
// PAID PER GENERATION: fal.ai bills the owner's fal account for
// every completed generation. The route gates generation behind
// sign-in + daily budget; this adapter never runs for guests.
// No verified per-image fal price is recorded here (do not invent
// one): the per-user daily budget is the primary guard, and the
// real bill is fal's. Cost estimate is therefore 0 in usage logs
// for fal — the gap is stated, not papered over.
//
// Error messages here are INTERNAL ONLY (server logs).

import { AiError } from "../types";
import { GENERATE_SIZE_MAP, type GenerateResult, type GenerateSize } from "./types";

const QUEUE_BASE = "https://queue.fal.run";

/** Model slug from env only — override without a code change. */
export function falImageModel(): string {
  return (process.env.FAL_IMAGE_MODEL ?? "").trim() || "fal-ai/flux/schnell";
}

export function falGenerateConfigured(): boolean {
  return Boolean((process.env.FAL_KEY ?? "").trim());
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface FalSubmitResponse {
  request_id?: string;
  status_url?: string;
  response_url?: string;
}

interface FalStatusResponse {
  status?: string;
}

interface FalResultResponse {
  data?: { images?: Array<{ url?: string; width?: number; height?: number }> };
  detail?: unknown;
}

/**
 * Generate one image from a text prompt via the fal queue.
 * Polls every 2s until COMPLETED or the deadline (default 50s,
 * inside the route's 60s serverless limit). Throws AiError:
 * AI_NOT_CONFIGURED (no key), FAL_AUTH (401/403), FAL_RATE_LIMITED
 * (429), FAL_TIMEOUT (deadline hit — the request may still
 * complete on fal's side and bill, so a client retry bills again;
 * the fast default model keeps this rare), FAL_FAILED / FAL_NO_OUTPUT.
 */
export async function falGenerateImage(opts: {
  prompt: string;
  size: GenerateSize;
  timeoutMs?: number;
}): Promise<GenerateResult> {
  const key = (process.env.FAL_KEY ?? "").trim();
  if (!key) throw new AiError("AI_NOT_CONFIGURED", "fal.ai is not configured.", 503);
  const model = falImageModel();
  const deadline = Date.now() + (opts.timeoutMs ?? 50000);
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Key ${key}`,
  };
  let submit: Response;
  try {
    submit = await fetch(`${QUEUE_BASE}/${model}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        input: {
          prompt: opts.prompt,
          image_size: GENERATE_SIZE_MAP[opts.size].falImageSize,
          num_inference_steps: 4,
          num_images: 1,
          output_format: "jpeg",
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new AiError("FAL_FAILED", "Could not reach fal.ai.", 502);
  }
  if (submit.status === 401 || submit.status === 403) {
    throw new AiError("FAL_AUTH", "fal.ai rejected the key.", 503);
  }
  if (submit.status === 429) {
    throw new AiError("FAL_RATE_LIMITED", "fal.ai is rate limited right now.", 429, true);
  }
  if (submit.status < 200 || submit.status >= 300) {
    throw new AiError("FAL_FAILED", "fal.ai did not accept the generation.", 502);
  }
  const submitted = (await submit.json().catch(() => null)) as FalSubmitResponse | null;
  const statusUrl = submitted?.status_url;
  const responseUrl = submitted?.response_url;
  if (!statusUrl || !responseUrl) {
    throw new AiError("FAL_FAILED", "fal.ai returned an unusable queue response.", 502);
  }
  // Poll until COMPLETED. A failed/cancelled request also reports
  // COMPLETED, so the result fetch below is what proves success.
  for (;;) {
    if (Date.now() > deadline) {
      throw new AiError("FAL_TIMEOUT", "fal.ai did not finish in time.", 504);
    }
    let statusRes: Response;
    try {
      statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Key ${key}` },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new AiError("FAL_FAILED", "Could not poll fal.ai.", 502);
    }
    if (statusRes.status === 401 || statusRes.status === 403) {
      throw new AiError("FAL_AUTH", "fal.ai rejected the key.", 503);
    }
    const statusBody = (await statusRes.json().catch(() => null)) as FalStatusResponse | null;
    if (statusBody?.status === "COMPLETED") break;
    if (statusBody?.status && !["IN_QUEUE", "IN_PROGRESS"].includes(statusBody.status)) {
      throw new AiError("FAL_FAILED", "fal.ai ended the generation unsuccessfully.", 502);
    }
    await sleep(2000);
  }
  let resultRes: Response;
  try {
    resultRes = await fetch(responseUrl, {
      headers: { Authorization: `Key ${key}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new AiError("FAL_FAILED", "Could not fetch the fal.ai result.", 502);
  }
  if (resultRes.status < 200 || resultRes.status >= 300) {
    throw new AiError("FAL_FAILED", "fal.ai returned no usable result.", 502);
  }
  const resultBody = (await resultRes.json().catch(() => null)) as FalResultResponse | null;
  const imageUrl = resultBody?.data?.images?.[0]?.url;
  if (!imageUrl) {
    throw new AiError("FAL_NO_OUTPUT", "fal.ai returned no image.", 502);
  }
  let imageRes: Response;
  try {
    imageRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
  } catch {
    throw new AiError("FAL_FAILED", "Could not download the fal.ai image.", 502);
  }
  if (!imageRes.ok) {
    throw new AiError("FAL_FAILED", "Could not download the fal.ai image.", 502);
  }
  const bytes = Buffer.from(await imageRes.arrayBuffer());
  if (bytes.length === 0) {
    throw new AiError("FAL_NO_OUTPUT", "fal.ai returned an empty image.", 502);
  }
  const mime = imageRes.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  return { buffer: bytes, mime, provider: "fal", model };
}
