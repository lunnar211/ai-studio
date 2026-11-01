// Local (no-LLM) photo analysis. Runs on the server with Sharp, so it
// works with zero provider keys and never sends the image anywhere.
// Used for the grayscale auto-detect, the "Recommended" suggestion, and
// as the fallback when no vision provider is configured. Anything it
// cannot know (faces, era, damage) is reported as unknown, never guessed.

import sharp from "sharp";

export interface LocalAnalysis {
  isGrayscale: boolean;
  /** Mean absolute channel difference (0..255); low = grayscale. */
  meanChroma: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  /** "grayscale" | "color" — the honest, measured answer. */
  kind: "grayscale" | "color";
}

/** Grayscale threshold on mean chroma (tuned on real scans: B&W photos
 *  sit under ~4, colour photos above ~15; 8 leaves a safe middle). */
export const GRAYSCALE_CHROMA_THRESHOLD = 8;

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
  const pixels = info.width * info.height;
  let sum = 0;
  for (let p = 0; p < pixels; p++) {
    const o = p * channels;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    sum += Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
  }
  const meanChroma = pixels ? sum / pixels : 0;
  const isGrayscale = meanChroma < GRAYSCALE_CHROMA_THRESHOLD;
  return {
    isGrayscale,
    meanChroma: Math.round(meanChroma * 10) / 10,
    width,
    height,
    hasAlpha,
    kind: isGrayscale ? "grayscale" : "color",
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
