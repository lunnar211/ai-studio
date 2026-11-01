// Colorize pipeline helpers (Phase 1). Pure image math lives here so
// it is unit-testable; the job routes own Replicate calls, credits,
// and database rows.
//
// Honesty contract: colours are ESTIMATED by the model, never original.
// The merge always keeps the ORIGINAL image's L (luminance) channel —
// sharpness and detail never come from the model — and takes only a/b
// (chrominance) from the model output. Styles and eras only scale or
// shift those estimated a/b values; they never invent detail.

import sharp from "sharp";
import { labToRgb, mergeLabLuminance, rgbToLab } from "./lab";
import type { ColorEra, ColorStyle } from "./color-constants";

export type { ColorEra, ColorStyle };

/**
 * Style + era adjustments to the estimated chroma. Pure function:
 * intensity scales a/b (0..1), shifts nudge warmth/coolness in Lab
 * units (small: ±8 is visible but not garish).
 */
export function styleAdjust(
  style: ColorStyle,
  era: ColorEra,
  intensityPct: number
): { intensity: number; aShift: number; bShift: number } {
  let intensity = Math.min(100, Math.max(0, intensityPct)) / 100;
  let aShift = 0;
  let bShift = 0;
  if (style === "vivid") intensity = Math.min(1, intensity * 1.25);
  if (style === "warm") {
    intensity = intensity * 0.9;
    aShift += 6;
    bShift += 8;
  }
  if (style === "cool") {
    intensity = intensity * 0.9;
    aShift -= 4;
    bShift -= 8;
  }
  if (era === "1900s-1940s") {
    intensity = intensity * 0.8;
    aShift += 3;
    bShift += 4;
  }
  if (era === "1980s+") intensity = Math.min(1, intensity * 1.1);
  return { intensity, aShift, bShift };
}

/**
 * Normalize an upload for the pipeline: fix EXIF orientation, flatten
 * transparency onto white (photos have no transparency), strip EXIF
 * (Sharp drops metadata unless withMetadata is used), encode as JPEG.
 * Returns the normalized bytes + dimensions.
 */
export async function normalizeUpload(input: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  const pipe = sharp(input).rotate().flatten({ background: "#ffffff" });
  const meta = await pipe.metadata();
  const buffer = await pipe.jpeg({ quality: 92 }).toBuffer();
  const outMeta = await sharp(buffer).metadata();
  return { buffer, width: outMeta.width ?? meta.width ?? 0, height: outMeta.height ?? meta.height ?? 0 };
}

/**
 * Prepare an AI-model input (P0 speed rule): normalize, then resize
 * with Sharp to max 1536px on the longest edge BEFORE sending to any
 * AI model. Large scans are slow and expensive at full size, and the
 * model output is LAB-merged onto this resized original and then
 * upscaled to the plan cap — so no detail is lost that the pipeline
 * would have kept. Tiling is NOT used: the wired models expose no
 * tiling parameter, so downscaling (not tiling) is the honest way to
 * keep jobs fast. The Enhance-only Sharp path does not use this: it
 * works on the full image.
 */
export async function prepareAiInput(input: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  const normalized = await normalizeUpload(input);
  const resized = await sharp(normalized.buffer)
    .resize(1536, 1536, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
  const meta = await sharp(resized).metadata();
  return { buffer: resized, width: meta.width ?? normalized.width, height: meta.height ?? normalized.height };
}

/** Decode any image buffer to raw RGB + dimensions. */
export async function decodeRgb(input: Buffer): Promise<{
  data: Buffer;
  width: number;
  height: number;
}> {
  const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  if (channels === 3) return { data, width: info.width, height: info.height };
  // Drop alpha (and any extra channels) — the pipeline is RGB-only.
  const pixels = info.width * info.height;
  const rgb = Buffer.alloc(pixels * 3);
  for (let p = 0; p < pixels; p++) {
    rgb[p * 3] = data[p * channels];
    rgb[p * 3 + 1] = data[p * channels + 1];
    rgb[p * 3 + 2] = data[p * channels + 2];
  }
  return { data: rgb, width: info.width, height: info.height };
}

/**
 * Merge a colorized model output onto the original: keep the original
 * L, take model a/b scaled by intensity + style/era shifts. The model
 * output is resized to the original dimensions first (DDColor
 * preserves size, but a mismatch must never crash the merge).
 * Returns a JPEG buffer (ready for the upscale step or final encode).
 */
export async function mergeColorized(
  original: Buffer,
  modelOutput: Buffer,
  opts: { style: ColorStyle; era: ColorEra; intensityPct: number }
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const orig = await decodeRgb(original);
  let model = await decodeRgb(modelOutput);
  if (model.width !== orig.width || model.height !== orig.height) {
    const resized = await sharp(modelOutput)
      .resize(orig.width, orig.height, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    model = { data: resized.data, width: resized.info.width, height: resized.info.height };
  }
  const origLab = rgbToLab(orig.data, orig.width, orig.height);
  const modelLab = rgbToLab(model.data, model.width, model.height);
  const { intensity, aShift, bShift } = styleAdjust(opts.style, opts.era, opts.intensityPct);
  const merged = mergeLabLuminance(origLab, modelLab, intensity);
  if (aShift !== 0 || bShift !== 0) {
    for (let i = 0; i < merged.length; i += 3) {
      merged[i + 1] += aShift;
      merged[i + 2] += bShift;
    }
  }
  const rgb = labToRgb(merged, orig.width, orig.height);
  const buffer = await sharp(rgb, { raw: { width: orig.width, height: orig.height, channels: 3 } })
    .jpeg({ quality: 92 })
    .toBuffer();
  return { buffer, width: orig.width, height: orig.height };
}

/** Longest-edge cap for a plan (single limits config). */
export function edgeCapForPlan(plan: "FREE" | "PREMIUM"): number {
  return plan === "PREMIUM" ? 4096 : 2048;
}

/**
 * Final encode: cap the longest edge, encode to the requested format,
 * and keep the response deliverable (Vercel responses cannot carry
 * arbitrarily large bodies). If a PNG is still over ~4.5 MB, it is
 * delivered as JPG instead — reported via deliveredAs, never silently.
 */
export async function encodeResult(
  input: Buffer,
  opts: { format: "png" | "jpg" | "webp"; quality: number; maxEdge: number }
): Promise<{ buffer: Buffer; mime: string; width: number; height: number; deliveredAs: string | null }> {
  const capped = await sharp(input)
    .resize(opts.maxEdge, opts.maxEdge, { fit: "inside", withoutEnlargement: true })
    .toBuffer();
  const meta = await sharp(capped).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const MAX_RESPONSE_BYTES = 4.5 * 1024 * 1024;
  const encode = async (format: "png" | "jpg" | "webp", quality: number): Promise<{ buffer: Buffer; mime: string }> => {
    if (format === "png") {
      return { buffer: await sharp(capped).png().toBuffer(), mime: "image/png" };
    }
    if (format === "webp") {
      return { buffer: await sharp(capped).webp({ quality }).toBuffer(), mime: "image/webp" };
    }
    return { buffer: await sharp(capped).jpeg({ quality }).toBuffer(), mime: "image/jpeg" };
  };
  let out = await encode(opts.format, opts.quality);
  let deliveredAs: string | null = null;
  if (out.buffer.length > MAX_RESPONSE_BYTES && opts.format === "png") {
    out = await encode("jpg", 85);
    deliveredAs = "Delivered as JPG instead of PNG: the PNG was too large to send back reliably.";
  }
  if (out.buffer.length > MAX_RESPONSE_BYTES) {
    out = await encode("jpg", 75);
    deliveredAs = "Delivered as a smaller JPG: the full-size file was too large to send back reliably.";
  }
  return { buffer: out.buffer, mime: out.mime, width, height, deliveredAs };
}

export function toDataUri(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}
