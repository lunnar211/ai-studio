// Local (no-LLM) photo analysis. Runs on the server with Sharp, so it
// works with zero provider keys and never sends the image anywhere.
// Used for the grayscale auto-detect, the "Recommended" suggestion, and
// as the fallback when no vision provider is configured. Anything it
// cannot know (faces, era, damage) is reported as unknown, never guessed.

import sharp from "sharp";
import {
  analyzeMonochrome,
  MONOCHROME_RAW_CHROMA_THRESHOLD,
} from "@/lib/photo/monochrome";

export interface LocalAnalysis {
  isGrayscale: boolean;
  /** Mean absolute channel difference (0..255); low = grayscale. */
  meanChroma: number;
  /** Fraction of bright pixels that are clearly colourful (0..1). */
  fracSaturated: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  /** "grayscale" | "color" — the honest, measured answer. */
  kind: "grayscale" | "color";
}

/** Raw-chroma leg of the sepia-aware rule (see lib/photo/monochrome).
 *  Kept exported: the old single-threshold rule it named is
 *  superseded by analyzeMonochrome, which also counts saturated
 *  pixels — the leg that catches sepia old photos (raw chroma ~25
 *  but fracSaturated ~0.25, measured 2026-11-01). */
export const GRAYSCALE_CHROMA_THRESHOLD = MONOCHROME_RAW_CHROMA_THRESHOLD;

export async function analyzeImageLocal(input: Buffer): Promise<LocalAnalysis> {
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const hasAlpha = meta.hasAlpha === true;
  // Downscale to at most 256px on the long edge for the chroma sample:
  // fast, and chroma is a global property, not a detail property.
  const { data, info } = await sharp(input)
    .resize(256, 256, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const mono = analyzeMonochrome(data, channels);
  const isGrayscale = mono.kind === "grayscale";
  return {
    isGrayscale,
    meanChroma: mono.meanChroma,
    fracSaturated: mono.fracSaturated,
    width,
    height,
    hasAlpha,
    kind: mono.kind,
  };
}

/**
 * Recommendation from local facts only. Never claims AI analysis:
 * grayscale + large enough => Colorize; tiny/blurry => HD upscale;
 * otherwise Enhance only.
 */
export function recommendFromLocal(a: LocalAnalysis): string {
  if (a.isGrayscale) {
    if (Math.max(a.width, a.height) < 1024) return "Colorize + HD";
    return "Colorize";
  }
  if (Math.max(a.width, a.height) < 1024) return "Enhance + HD";
  return "Enhance only";
}
