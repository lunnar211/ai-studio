// Browser colorize core: DeOldify ONNX via ONNX Runtime Web.
//
// Model facts (verified 2026-11-01 from the author's own write-up,
// "Browser-Based AI Image Colorization with DeOldify and ONNX Runtime"):
// - File: deoldify.quant.onnx — an INT8-quantized DeOldify export,
//   served at ~64 MB (measured 2026-11-01; an earlier "~25 MB" note
//   was wrong), hosted on GitHub raw.
// - Input: float32 tensor named "input", shape [1, 3, 256, 256],
//   NCHW, raw 0–255 values (the reference code does NOT divide by 255).
// - Output: float32 tensor named "out", shape [1, 3, 256, 256],
//   NCHW, raw 0–255 values, clamped to 0–255 on postprocess.
// - The reference pipeline squashes the photo to 256×256, runs the
//   model, then upscales the 256px colour output to the original size.
//   This site does one thing better: after upscaling it LAB-merges
//   (lib/browser/lab.ts) so detail comes from the ORIGINAL photo,
//   exactly like the server pipeline.
// - The model file itself is a community conversion (linmingren /
//   openmodels), not an official DeOldify release. DeOldify itself is
//   MIT-licensed (repo LICENSE + GitHub sidebar, verified 2026-11-01).
//
// This module has NO DOM dependencies except fetch + Cache API (both
// available in windows and in workers), so the worker and the
// main-thread fallback share it, and vitest can test the pure parts.

export const DEOLDIFY_MODEL_URL =
  "https://raw.githubusercontent.com/linmingren/openmodels/main/models/deoldify/deoldify.quant.onnx";
export const DEOLDIFY_CACHE_NAME = "colorize-model-cache-v1";
/** Fallback model size, used ONLY when the server sends no
 *  Content-Length. Measured 2026-11-01: the file served at
 *  DEOLDIFY_MODEL_URL is ~64 MB (an earlier "~25 MB" note was wrong
 *  and is corrected here — never quote 25 MB to users). */
export const DEOLDIFY_MODEL_SIZE_ESTIMATE = 64 * 1024 * 1024;
export const DEOLDIFY_INPUT_SIZE = 256;
export const DEOLDIFY_INPUT_NAME = "input";
export const DEOLDIFY_OUTPUT_NAME = "out";

/**
 * onnxruntime-web version this code was built against. The WASM
 * backend loads its .wasm files from the jsDelivr CDN at this version;
 * a test asserts this matches the installed package, so an upgrade
 * that forgets this constant fails loudly instead of silently
 * breaking WASM fallback in production.
 */
export const ORT_WEB_VERSION = "1.31.1";
export function ortWasmPaths(): string {
  return `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_WEB_VERSION}/dist/`;
}

export type ModelProgress = (receivedBytes: number, totalBytes: number | null) => void;

/**
 * Fetch the model with byte progress, cached in the Cache API after
 * the first download. Returns the model bytes. A cached copy is
 * returned immediately with a single progress callback at 100%.
 * Throws on network failure or a non-OK response.
 */
export async function fetchDeoldifyModel(onProgress?: ModelProgress): Promise<ArrayBuffer> {
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(DEOLDIFY_CACHE_NAME);
      const hit = await cache.match(DEOLDIFY_MODEL_URL);
      if (hit) {
        const buf = await hit.arrayBuffer();
        onProgress?.(buf.byteLength, buf.byteLength);
        return buf;
      }
    } catch {
      // Cache API unavailable (private mode, old browser): fall through
      // to a plain network fetch. The model still works, it just
      // re-downloads on the next visit.
    }
  }
  const res = await fetch(DEOLDIFY_MODEL_URL);
  if (!res.ok || !res.body) {
    throw new Error(`Model download failed (HTTP ${res.status}).`);
  }
  const totalHeader = res.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onProgress?.(received, total);
    }
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  const buf = merged.buffer;
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(DEOLDIFY_CACHE_NAME);
      await cache.put(
        DEOLDIFY_MODEL_URL,
        new Response(buf.slice(0), { headers: { "content-type": "application/octet-stream" } })
      );
    } catch {
      // Caching is best-effort only.
    }
  }
  return buf;
}

/**
 * Reference preprocess, exactly: RGBA pixels (already 256×256) ->
 * float32 NCHW with raw 0–255 values, alpha skipped, channel-first.
 */
export function rgbaToNchw(rgba: Uint8ClampedArray): Float32Array {
  const pixels = rgba.length / 4;
  const out = new Float32Array(pixels * 3);
  for (let p = 0; p < pixels; p++) {
    out[p] = rgba[p * 4];
    out[pixels + p] = rgba[p * 4 + 1];
    out[pixels * 2 + p] = rgba[p * 4 + 2];
  }
  return out;
}

/**
 * Desaturate RGBA pixels to true greyscale, in place of the colour
 * information DeOldify must NOT see. DeOldify was trained on
 * greyscale inputs; feeding it a sepia-tinted photo makes it
 * produce vivid purple/blue blotches (proven 2026-11-01 on a real
 * sepia photo: 28.8% of output pixels were extreme blue with a
 * sepia input, vs 0.8% with a greyscale input). The luma formula is
 * the same one PIL's convert("L") uses (ITU-R 601-2). Alpha is
 * preserved. This is REQUIRED for sepia/faded photos and harmless
 * for pure B&W (already grey) — and the LAB merge still takes its
 * detail (L) from the untouched original, so nothing is lost.
 */
export function toGrayscale(
  rgba: Uint8ClampedArray<ArrayBufferLike>
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rgba.length);
  for (let o = 0; o + 3 < rgba.length; o += 4) {
    const luma = Math.round(
      (rgba[o] * 299 + rgba[o + 1] * 587 + rgba[o + 2] * 114) / 1000
    );
    out[o] = luma;
    out[o + 1] = luma;
    out[o + 2] = luma;
    out[o + 3] = rgba[o + 3];
  }
  return out;
}

/**
 * Reference postprocess, exactly: NCHW float 0–255 -> RGBA pixels,
 * values clamped to 0–255 and rounded, alpha fully opaque.
 */
export function nchwToRgba(tensor: Float32Array, width: number, height: number): Uint8ClampedArray {
  const pixels = width * height;
  const out = new Uint8ClampedArray(pixels * 4);
  for (let p = 0; p < pixels; p++) {
    const r = Math.round(Math.min(255, Math.max(0, tensor[p])));
    const g = Math.round(Math.min(255, Math.max(0, tensor[pixels + p])));
    const b = Math.round(Math.min(255, Math.max(0, tensor[pixels * 2 + p])));
    out[p * 4] = r;
    out[p * 4 + 1] = g;
    out[p * 4 + 2] = b;
    out[p * 4 + 3] = 255;
  }
  return out;
}

/** Minimal session shape, so tests can stub it and both the worker
 *  and the main-thread fallback can pass a real ort session. */
export type OnnxSessionLike = {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array | unknown }>>;
};

export type TensorFactory = (
  data: Float32Array,
  dims: [number, number, number, number]
) => unknown;

/** Full inference with an explicit tensor factory (ort.Tensor). */
export async function runDeoldifyWithTensor(
  session: OnnxSessionLike,
  makeTensor: TensorFactory,
  rgba256: Uint8ClampedArray
): Promise<Uint8ClampedArray> {
  const input = rgbaToNchw(rgba256);
  const feeds: Record<string, unknown> = {
    [DEOLDIFY_INPUT_NAME]: makeTensor(input, [1, 3, DEOLDIFY_INPUT_SIZE, DEOLDIFY_INPUT_SIZE]),
  };
  const results = await session.run(feeds);
  const out = results[DEOLDIFY_OUTPUT_NAME];
  if (!out) throw new Error("The colorize model returned no output.");
  const data = out.data as Float32Array;
  return nchwToRgba(data, DEOLDIFY_INPUT_SIZE, DEOLDIFY_INPUT_SIZE);
}
