// The banded colorize merge must be byte-identical to the old
// whole-image merge: rgbToLab / mergeLabLuminance / labToRgb are all
// per-pixel, so splitting rows cannot change any output pixel.
// Guards the 2026-11-01 phone-memory fix (banding) against ever
// silently changing colours.
import { describe, expect, it } from "vitest";
import {
  labToRgb,
  mergeColorizeBanded,
  mergeLabLuminance,
  rgbToLab,
} from "@/lib/browser/lab";

function wholeImageMerge(
  orig: Uint8Array,
  model: Uint8Array,
  pixels: number,
  intensity: number
): Uint8ClampedArray {
  const origLab = rgbToLab(orig, pixels);
  const modelLab = rgbToLab(model, pixels);
  const merged = mergeLabLuminance(origLab, modelLab, intensity);
  const mergedRgb = labToRgb(merged, pixels);
  const out = new Uint8ClampedArray(pixels * 4);
  for (let p = 0; p < pixels; p++) {
    out[p * 4] = mergedRgb[p * 3];
    out[p * 4 + 1] = mergedRgb[p * 3 + 1];
    out[p * 4 + 2] = mergedRgb[p * 3 + 2];
    out[p * 4 + 3] = 255;
  }
  return out;
}

describe("mergeColorizeBanded", () => {
  it("matches the whole-image merge byte for byte, across band edges", () => {
    // 300 rows forces multiple bands (256-row bands) plus a partial band.
    const w = 37;
    const h = 300;
    const pixels = w * h;
    const orig = new Uint8Array(pixels * 3);
    const model = new Uint8Array(pixels * 3);
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % 256;
    };
    for (let i = 0; i < pixels * 3; i++) {
      orig[i] = rnd();
      model[i] = rnd();
    }
    for (const intensity of [0, 0.7, 1]) {
      const banded = mergeColorizeBanded(orig, model, w, h, intensity);
      const whole = wholeImageMerge(orig, model, pixels, intensity);
      expect(Array.from(banded)).toEqual(Array.from(whole));
    }
  });

  it("keeps alpha opaque and handles a single pixel", () => {
    const out = mergeColorizeBanded(
      new Uint8Array([200, 150, 100]),
      new Uint8Array([10, 80, 200]),
      1,
      1,
      0.7
    );
    expect(out.length).toBe(4);
    expect(out[3]).toBe(255);
  });
});
