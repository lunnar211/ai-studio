// Regression tests for the 2026-11-01 blotch bug: the browser
// colorize pipeline fed sepia photos straight to DeOldify, and the
// model — trained on greyscale — answered with vivid purple/blue
// blotches (28.8% of output pixels extreme blue, measured on a real
// sepia photo, vs 0.8% when the input was desaturated first).
// The fix desaturates the model input with toGrayscale; these tests
// pin that function down.
import { describe, expect, it } from "vitest";
import { toGrayscale } from "@/lib/browser/deoldify-core";

describe("toGrayscale", () => {
  it("turns a sepia pixel into true grey with the ITU-R 601 luma", () => {
    // Sepia pixel (180, 150, 100) -> (180*299 + 150*587 + 100*114)/1000 = 153.27 -> 153
    const out = toGrayscale(new Uint8ClampedArray([180, 150, 100, 255]));
    expect(Array.from(out)).toEqual([153, 153, 153, 255]);
  });

  it("leaves pure grey pixels unchanged", () => {
    const out = toGrayscale(
      new Uint8ClampedArray([0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255])
    );
    expect(Array.from(out)).toEqual([0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255]);
  });

  it("preserves alpha and does not mutate the input", () => {
    const input = new Uint8ClampedArray([200, 100, 50, 128]);
    const out = toGrayscale(input);
    expect(out[3]).toBe(128);
    expect(Array.from(input)).toEqual([200, 100, 50, 128]);
    expect(out).not.toBe(input);
  });

  it("handles black and saturated colour pixels", () => {
    const out = toGrayscale(
      new Uint8ClampedArray([0, 0, 0, 255, 40, 80, 200, 255])
    );
    // Blue (40, 80, 200) -> (40*299 + 80*587 + 200*114)/1000 = 81.72 -> 82
    expect(Array.from(out)).toEqual([0, 0, 0, 255, 82, 82, 82, 255]);
  });
});
