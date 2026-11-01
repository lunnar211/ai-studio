// FREE + UNLIMITED photo model: tier routing, the grayscale-gate
// override, and the faded/sepia fixture that used to fool the gate.
//
// The owner's complaint: a faded old photo was read as "colour", the
// gate refused colorize, and the UI showed a credit line + a red
// "unavailable" box. The fix: the gate is a hint, the user's explicit
// "Colorize anyway" always wins, free users never touch paid GPU,
// and free paths carry no credit numbers at all.

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { colorizeAttemptOrder, planMayUsePaidGpu } from "../lib/ai/tiers";
import { grayscaleHint, shouldRefuseColorize } from "../lib/ai/grayscale-gate";
import { analyzeImageLocal, GRAYSCALE_CHROMA_THRESHOLD } from "../lib/ai/image-analysis";
import { LIMITS } from "../lib/limits";
import { formatModelProgress } from "../lib/browser/deoldify";

describe("free-tier routing (never paid GPU for free users)", () => {
  it("routes FREE server jobs to Space then Gemini, never to paid GPU", () => {
    // Owner-authorized 2026-11-01: Nano Banana (Gemini, ~$0.039/image
    // on the owner's bill) is the server fallback when the free Space
    // is unconfigured. The hard rule stays: FREE never touches
    // Replicate paid GPU, and the free Space stays first.
    expect(colorizeAttemptOrder("FREE")).toEqual(["space", "gemini"]);
    expect(colorizeAttemptOrder("FREE")).not.toContain("replicate");
    expect(planMayUsePaidGpu("FREE")).toBe(false);
  });
  it("routes PREMIUM jobs to paid GPU first, then Space, then Gemini", () => {
    expect(colorizeAttemptOrder("PREMIUM")).toEqual(["replicate", "space", "gemini"]);
    expect(planMayUsePaidGpu("PREMIUM")).toBe(true);
  });
  it("declares free photos unlimited in the single limits config", () => {
    expect(LIMITS.photoFreeUnlimited).toBe(true);
  });
});

describe("grayscale gate: hint, never a block", () => {
  it("refuses colorize only for a colour photo WITHOUT an explicit override", () => {
    expect(shouldRefuseColorize({ isGrayscale: true, colorizeAnyway: false })).toBe(false);
    expect(shouldRefuseColorize({ isGrayscale: false, colorizeAnyway: false })).toBe(true);
  });
  it("lets the user's explicit 'Colorize anyway' beat the gate's guess", () => {
    expect(shouldRefuseColorize({ isGrayscale: false, colorizeAnyway: true })).toBe(false);
    expect(grayscaleHint(false)).toContain("Colorize anyway");
    expect(grayscaleHint(true)).toBeNull();
  });
});

/** A faded/sepia old photo: warm-tinted grayscale gradient. The tint
 *  pushes mean chroma above the grayscale threshold, exactly like the
 *  owner's faded photo — the old gate would have refused it. */
async function fadedSepiaPhoto(): Promise<Buffer> {
  const w = 200;
  const h = 150;
  const px = w * h;
  const raw = Buffer.alloc(px * 3);
  for (let i = 0; i < px; i++) {
    const g = (i * 7) % 256;
    raw[i * 3] = Math.min(255, Math.round(g * 1.08)); // warm red lift
    raw[i * 3 + 1] = Math.round(g * 0.94);
    raw[i * 3 + 2] = Math.round(g * 0.68); // blue pulled down = sepia cast
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
}

describe("faded/sepia fixture (the owner's case)", () => {
  it("is measured as 'colour' by chroma — yet 'Colorize anyway' still allows it", async () => {
    const a = await analyzeImageLocal(await fadedSepiaPhoto());
    expect(a.meanChroma).toBeGreaterThanOrEqual(GRAYSCALE_CHROMA_THRESHOLD);
    expect(a.isGrayscale).toBe(false);
    // Old behaviour would stop here with a refusal. New behaviour:
    // the hint is shown, but the explicit override proceeds.
    expect(shouldRefuseColorize({ isGrayscale: a.isGrayscale, colorizeAnyway: false })).toBe(true);
    expect(shouldRefuseColorize({ isGrayscale: a.isGrayscale, colorizeAnyway: true })).toBe(false);
  });
  it("still recognises a true black-and-white photo as grayscale", async () => {
    const w = 200;
    const h = 150;
    const px = w * h;
    const raw = Buffer.alloc(px);
    for (let i = 0; i < px; i++) raw[i] = (i * 7) % 256;
    const bw = await sharp(raw, { raw: { width: w, height: h, channels: 1 } }).jpeg().toBuffer();
    const a = await analyzeImageLocal(bw);
    expect(a.isGrayscale).toBe(true);
    expect(shouldRefuseColorize({ isGrayscale: a.isGrayscale, colorizeAnyway: false })).toBe(false);
  });
});

describe("browser model download copy (size corrected)", () => {
  it("never quotes the wrong ~25 MB figure to users", () => {
    const line = formatModelProgress({ stage: "downloading-model", receivedBytes: 1024 * 1024, totalBytes: 64 * 1024 * 1024 });
    expect(line).not.toContain("25 MB");
    expect(line).toContain("one-time");
    expect(line).toContain("64.0 MB");
  });
});
