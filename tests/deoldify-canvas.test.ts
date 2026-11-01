// Regression tests for the 2026-11-01 browser colorize peak: canvases
// whose pixels were already copied out stayed alive (backing stores
// included) through the model run and the PNG encode, stacking on
// top of the model's own peak. releaseCanvas frees a canvas's
// backing store immediately; these tests pin its contract down.
import { describe, expect, it } from "vitest";
import { releaseCanvas } from "@/lib/browser/deoldify";

describe("releaseCanvas", () => {
  it("zeroes width and height, freeing the backing store", () => {
    const canvas = { width: 2048, height: 1536 } as unknown as HTMLCanvasElement;
    releaseCanvas(canvas);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it("is safe to call on an already-released canvas", () => {
    const canvas = { width: 0, height: 0 } as unknown as HTMLCanvasElement;
    expect(() => releaseCanvas(canvas)).not.toThrow();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});
