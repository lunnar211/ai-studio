// Phase 0: Lab colour-space round-trip + luminance merge (the
// colorize pipeline's detail-preservation step), and local grayscale
// detection on generated images (no fixtures needed, no network).

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { labToRgb, mergeLabLuminance, rgbToLab } from "../lib/ai/lab";
import { analyzeImageLocal, GRAYSCALE_CHROMA_THRESHOLD } from "../lib/ai/image-analysis";

describe("Lab round-trip", () => {
  it("rgb -> Lab -> rgb returns (approximately) the original pixels", () => {
    // 2x2: red, green, blue, white.
    const rgb = Buffer.from([
      255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255,
    ]);
    const lab = rgbToLab(rgb, 2, 2);
    const back = labToRgb(lab, 2, 2);
    for (let i = 0; i < rgb.length; i++) {
      expect(Math.abs(back[i] - rgb[i])).toBeLessThanOrEqual(4);
    }
  });
  it("merge keeps the ORIGINAL L and takes a/b from the colorized image", () => {
    // Original: mid grey (L ~53, a/b ~0). Colorized: same pixel tinted red.
    const origLab = rgbToLab(Buffer.from([128, 128, 128]), 1, 1);
    const colorLab = rgbToLab(Buffer.from([200, 60, 60]), 1, 1);
    const merged = mergeLabLuminance(origLab, colorLab, 1.0);
    // L must equal the original's L (detail preserved), a/b the colorized.
    expect(merged[0]).toBeCloseTo(origLab[0], 0);
    expect(merged[1]).toBeCloseTo(colorLab[1], 0);
    expect(merged[2]).toBeCloseTo(colorLab[2], 0);
  });
  it("intensity 0 removes all chroma (back to grayscale)", () => {
    const origLab = rgbToLab(Buffer.from([128, 128, 128]), 1, 1);
    const colorLab = rgbToLab(Buffer.from([200, 60, 60]), 1, 1);
    const merged = mergeLabLuminance(origLab, colorLab, 0);
    expect(merged[1]).toBeCloseTo(0, 0);
    expect(merged[2]).toBeCloseTo(0, 0);
  });
});

describe("local grayscale detection", () => {
  it("detects a generated grey image as grayscale", async () => {
    const grey = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 128, g: 128, b: 128 } } })
      .png()
      .toBuffer();
    const a = await analyzeImageLocal(grey);
    expect(a.isGrayscale).toBe(true);
    expect(a.kind).toBe("grayscale");
    expect(a.meanChroma).toBeLessThan(GRAYSCALE_CHROMA_THRESHOLD);
  });
  it("detects a generated red image as colour", async () => {
    const red = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 220, g: 20, b: 20 } } })
      .png()
      .toBuffer();
    const a = await analyzeImageLocal(red);
    expect(a.isGrayscale).toBe(false);
    expect(a.kind).toBe("color");
    expect(a.meanChroma).toBeGreaterThan(GRAYSCALE_CHROMA_THRESHOLD);
  });
});
