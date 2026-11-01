// Sepia-aware monochrome detection — the single source of truth for
// "is this photo black & white?" used by BOTH the browser check
// (canvas pixels) and the server check (Sharp pixels).
//
// WHY THE OLD RULE FAILED (proven 2026-11-01 on a real user photo):
// the old rule called a photo "colour" when its mean max channel
// difference reached 8. Old photos are almost never pure grey — age
// yellows them into sepia, and sepia carries channel differences of
// ~25 (the user's old photo measured 24.6) while containing NO real
// colour information. So sepia old photos — exactly the photos users
// most want colorized — were refused colorize and downgraded to
// Enhance-only. That was the "still error" of 2026-11-01.
//
// THE NEW RULE: a photo counts as monochrome when EITHER
// - its raw mean channel difference is under 8 (pure B&W), OR
// - few of its bright pixels are clearly colourful: a pixel counts
//   as clearly colourful when (max-min)/max > 0.35, and the photo
//   counts as monochrome when under 35% of bright pixels qualify.
//   Sepia measures ~0.25 (warm tint, no real hues); a natural colour
//   photo measures ~0.42+ and a saturated graphic ~0.97, so 0.35
//   separates them with room on both sides.
// Bright means max channel >= 40: near-black pixels have unstable
// saturation (tiny values, huge ratios) and must not vote.
// HONEST LIMIT: no threshold separates a strongly faded colour photo
// from sepia perfectly — they are a continuum. The misclassification
// that remains possible is the BENIGN direction (a faded colour
// photo offered colorize; the user can still pick Enhance), and the
// UI always offers a "Colorize anyway" override, so no user is ever
// trapped by the detector again.

export interface MonochromeAnalysis {
  /** Mean max channel difference (0..255); the old raw metric, kept. */
  meanChroma: number;
  /** Fraction of bright pixels that are clearly colourful (0..1). */
  fracSaturated: number;
  kind: "grayscale" | "color";
}

/** Raw-chroma leg of the rule (unchanged from the old detector). */
export const MONOCHROME_RAW_CHROMA_THRESHOLD = 8;
/** A pixel is clearly colourful when its saturation exceeds this. */
export const MONOCHROME_SAT_THRESHOLD = 0.35;
/** A photo is monochrome when fewer than this fraction of its bright
 *  pixels are clearly colourful. */
export const MONOCHROME_FRAC_THRESHOLD = 0.35;
/** Pixels darker than this (max channel) do not vote. */
export const MONOCHROME_BRIGHT_MIN = 40;

/**
 * Analyze raw pixels. `data` holds `channels` values per pixel
 * (RGB or RGBA); only the first three channels are read.
 */
export function analyzeMonochrome(
  data: ArrayLike<number>,
  channels: number
): MonochromeAnalysis {
  const pixels = Math.floor(data.length / channels);
  if (pixels === 0) {
    return { meanChroma: 0, fracSaturated: 0, kind: "grayscale" };
  }
  let chromaSum = 0;
  let bright = 0;
  let saturated = 0;
  for (let p = 0; p < pixels; p++) {
    const o = p * channels;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    chromaSum += mx - mn;
    if (mx >= MONOCHROME_BRIGHT_MIN) {
      bright++;
      if ((mx - mn) / mx > MONOCHROME_SAT_THRESHOLD) saturated++;
    }
  }
  const meanChroma = chromaSum / pixels;
  const fracSaturated = bright === 0 ? 0 : saturated / bright;
  const kind =
    meanChroma < MONOCHROME_RAW_CHROMA_THRESHOLD ||
    fracSaturated < MONOCHROME_FRAC_THRESHOLD
      ? "grayscale"
      : "color";
  return {
    meanChroma: Math.round(meanChroma * 10) / 10,
    fracSaturated: Math.round(fracSaturated * 1000) / 1000,
    kind,
  };
}
