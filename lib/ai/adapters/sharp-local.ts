// Local Sharp pipelines: the always-available fallback that never
// sends the image anywhere. "Standard quality" means exactly this:
// upscale + sharpen + normalize on our own server, no AI involved.

import sharp from "sharp";
import { rgbToLab, labToRgb, mergeLabLuminance } from "../lab";

export interface StyleAdjust {
  saturation: number;
  hue: number;
  brightness: number;
}

export const COLOR_STYLES: Record<string, StyleAdjust> = {
  natural: { saturation: 1.0, hue: 0, brightness: 1.0 },
  vivid: { saturation: 1.25, hue: 0, brightness: 1.02 },
  warmVintage: { saturation: 0.9, hue: 6, brightness: 0.98 },
  cool: { saturation: 1.0, hue: -6, brightness: 1.0 },
};

export const ERA_ADJUST: Record<string, StyleAdjust> = {
  "1900s-1940s": { saturation: 0.85, hue: 5, brightness: 0.98 },
  "1950s-1970s": { saturation: 1.05, hue: 2, brightness: 1.0 },
  "1980s+": { saturation: 1.1, hue: 0, brightness: 1.0 },
};

function combineStyle(style: string, era: string): StyleAdjust {
  const s = COLOR_STYLES[style] ?? COLOR_STYLES.natural;
  const e = ERA_ADJUST[era] ?? { saturation: 1, hue: 0, brightness: 1 };
  return {
    saturation: s.saturation * e.saturation,
    hue: s.hue + e.hue,
    brightness: s.brightness * e.brightness,
  };
}

/** Existing standard-quality enhance: 2x lanczos3 + sharpen + normalize. */
export async function sharpEnhance(input: Buffer, maxEdge = 4096): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  return sharp(input)
    .resize(Math.min(w * 2, maxEdge), Math.min(h * 2, maxEdge), {
      kernel: "lanczos3",
      withoutEnlargement: false,
    })
    .sharpen({ sigma: 1.2, m1: 1.0, m2: 2.0 })
    .normalize()
    .png()
    .toBuffer();
}

/** Old-photo restore, local edition: median denoise + gentle sharpen +
 *  contrast normalize. This does NOT inpaint scratches and does NOT
 *  restore faces — those need a model, and the result label says so. */
export async function sharpRestore(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .median(3)
    .sharpen({ sigma: 1.0, m1: 0.8, m2: 1.5 })
    .normalize()
    .png()
    .toBuffer();
}

/**
 * Colorize merge: keep the ORIGINAL image's L channel, take only a/b
 * from the model output, scaled by intensity (0..1), then apply the
 * colour style + era adjustments. Alpha from the original is preserved.
 * Both inputs are resized to the original's dimensions first.
 */
export async function mergeColorized(opts: {
  original: Buffer;
  colorized: Buffer;
  intensity: number; // 0..1
  style: string;
  era: string;
  output: "png" | "jpeg" | "webp";
  jpegQuality?: number;
}): Promise<Buffer> {
  const origMeta = await sharp(opts.original).metadata();
  const width = origMeta.width ?? 0;
  const height = origMeta.height ?? 0;
  if (!width || !height) throw new Error("Original image has no dimensions.");
  const hasAlpha = origMeta.hasAlpha === true;

  const origRaw = await sharp(opts.original)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const modelRaw = await sharp(opts.colorized)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const origLab = rgbToLab(origRaw.data, width, height);
  const modelLab = rgbToLab(modelRaw.data, width, height);
  const merged = mergeLabLuminance(origLab, modelLab, opts.intensity);
  const rgb = labToRgb(merged, width, height);

  // Reattach the original alpha channel (or opaque alpha).
  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    rgba[p * 4] = rgb[p * 3];
    rgba[p * 4 + 1] = rgb[p * 3 + 1];
    rgba[p * 4 + 2] = rgb[p * 3 + 2];
    rgba[p * 4 + 3] = hasAlpha ? origRaw.data[p * 4 + 3] : 255;
  }

  const adj = combineStyle(opts.style, opts.era);
  let pipeline = sharp(rgba, { raw: { width, height, channels: 4 } }).modulate({
    saturation: adj.saturation,
    hue: adj.hue,
    brightness: adj.brightness,
  });
  if (opts.output === "jpeg") {
    pipeline = pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: opts.jpegQuality ?? 92 });
  } else if (opts.output === "webp") {
    pipeline = pipeline.webp({ quality: opts.jpegQuality ?? 90 });
  } else {
    pipeline = pipeline.png();
  }
  return pipeline.toBuffer();
}
