// Regression tests for the 2026-11-01 "still error": sepia old
// photos were measured as "colour" by the raw-chroma rule alone
// (mean max channel difference ~25 vs threshold 8) and were refused
// colorize. The sepia-aware rule also counts clearly colourful
// pixels; sepia fails that count, real colour passes it.
import { describe, expect, it } from "vitest";
import { analyzeMonochrome } from "@/lib/photo/monochrome";

function rgba(pixels: Array<[number, number, number]>): number[] {
  const out: number[] = [];
  for (const [r, g, b] of pixels) out.push(r, g, b, 255);
  return out;
}

describe("analyzeMonochrome", () => {
  it("pure grey pixels are grayscale", () => {
    const px = rgba([
      [0, 0, 0],
      [128, 128, 128],
      [255, 255, 255],
      [60, 60, 60],
    ]);
    const a = analyzeMonochrome(px, 4);
    expect(a.kind).toBe("grayscale");
    expect(a.meanChroma).toBe(0);
    expect(a.fracSaturated).toBe(0);
  });

  it("sepia old photo (warm tint, no real hues) is grayscale", () => {
    // Mirrors the measured user photo: mostly warm-grey pixels
    // (saturation ~0.25) with a minority of stronger-tinted pixels,
    // giving fracSaturated ~0.25, under the 0.35 line.
    const px: Array<[number, number, number]> = [];
    for (let i = 0; i < 75; i++) px.push([147, 128, 96]); // sat 0.35 edge-ish warm grey
    for (let i = 0; i < 25; i++) px.push([180, 120, 60]); // strongly tinted minority
    const a = analyzeMonochrome(rgba(px), 4);
    expect(a.meanChroma).toBeGreaterThan(8); // old rule alone would say "colour"
    expect(a.fracSaturated).toBeLessThan(0.35);
    expect(a.kind).toBe("grayscale");
  });

  it("saturated multi-hue pixels are colour", () => {
    const px: Array<[number, number, number]> = [];
    for (let i = 0; i < 50; i++) px.push([40, 80, 200]); // blue
    for (let i = 0; i < 50; i++) px.push([200, 60, 60]); // red
    const a = analyzeMonochrome(rgba(px), 4);
    expect(a.fracSaturated).toBeGreaterThan(0.35);
    expect(a.kind).toBe("color");
  });

  it("near-black pixels do not vote", () => {
    // Random hues at max < 40 would fake saturation without the guard.
    const px = rgba([
      [30, 10, 5],
      [5, 25, 10],
      [10, 5, 30],
      [128, 128, 128],
    ]);
    const a = analyzeMonochrome(px, 4);
    expect(a.kind).toBe("grayscale");
  });

  it("fraction boundary: 0.34 saturated is grayscale, 0.36 is colour", () => {
    const grey: [number, number, number] = [128, 128, 128];
    const red: [number, number, number] = [200, 60, 60];
    const mk = (nSat: number) => {
      const px: Array<[number, number, number]> = [];
      for (let i = 0; i < nSat; i++) px.push(red);
      for (let i = nSat; i < 100; i++) px.push(grey);
      return analyzeMonochrome(rgba(px), 4);
    };
    expect(mk(34).kind).toBe("grayscale");
    expect(mk(36).kind).toBe("color");
  });

  it("handles RGB (3-channel) buffers, not just RGBA", () => {
    const px = [128, 128, 128, 200, 60, 60, 40, 80, 200, 90, 90, 90];
    const a = analyzeMonochrome(px, 3);
    expect(a.fracSaturated).toBeGreaterThan(0.35);
    expect(a.kind).toBe("color");
  });
});
