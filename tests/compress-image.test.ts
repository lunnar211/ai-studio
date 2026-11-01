// Unit tests for the client-side pre-upload compression sizing loop
// (lib/browser/compress-image.ts). The canvas path itself is
// browser-only and cannot run in this Node test env, so these tests
// cover the pure loop — termination, monotonic shrinking, and the
// trigger — while the real-device behaviour is covered by the owner
// preview check with a large phone photo.
import { describe, expect, it } from "vitest";
import {
  COMPRESS_ABOVE_BYTES,
  MAX_COMPRESSION_STEPS,
  UPLOAD_BLOB_LIMIT_BYTES,
  compressionStepSequence,
  firstCompressionStep,
  needsCompression,
  nextCompressionStep,
  scaledDimensions,
} from "../lib/browser/compress-image";

describe("needsCompression", () => {
  it("compresses files over the upload limit, leaves smaller ones untouched", () => {
    expect(needsCompression(UPLOAD_BLOB_LIMIT_BYTES + 1)).toBe(true);
    expect(needsCompression(12 * 1024 * 1024)).toBe(true);
    expect(needsCompression(UPLOAD_BLOB_LIMIT_BYTES)).toBe(false);
    expect(needsCompression(3.1 * 1024 * 1024)).toBe(false);
  });
  it("the trigger matches the upload limit, not the 10 MB promise", () => {
    expect(COMPRESS_ABOVE_BYTES).toBe(UPLOAD_BLOB_LIMIT_BYTES);
    expect(UPLOAD_BLOB_LIMIT_BYTES).toBeLessThan(10 * 1024 * 1024);
  });
});

describe("firstCompressionStep", () => {
  it("starts at full size for normal photos", () => {
    expect(firstCompressionStep(3000, 2000)).toEqual({ scale: 1, quality: 0.92 });
  });
  it("caps the longest edge for very large photos", () => {
    const step = firstCompressionStep(8000, 6000);
    expect(step.scale).toBeCloseTo(4096 / 8000);
    expect(scaledDimensions(8000, 6000, step.scale).width).toBe(4096);
  });
});

describe("nextCompressionStep", () => {
  it("shrinks scale and quality every step", () => {
    const next = nextCompressionStep({ scale: 1, quality: 0.92 });
    expect(next).not.toBeNull();
    expect(next!.scale).toBeLessThan(1);
    expect(next!.quality).toBeLessThan(0.92);
  });
  it("terminates at the floor instead of looping forever", () => {
    const atFloor = nextCompressionStep({ scale: 0.25, quality: 0.55 });
    expect(atFloor).toBeNull();
  });
});

describe("compressionStepSequence", () => {
  it("is monotonic and bounded by the step cap", () => {
    const seq = compressionStepSequence({ scale: 1, quality: 0.92 });
    expect(seq.length).toBeGreaterThan(1);
    expect(seq.length).toBeLessThanOrEqual(MAX_COMPRESSION_STEPS);
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i].scale).toBeLessThanOrEqual(seq[i - 1].scale);
      expect(seq[i].quality).toBeLessThanOrEqual(seq[i - 1].quality);
    }
    const last = seq[seq.length - 1];
    expect(last.scale).toBe(0.25);
    expect(last.quality).toBe(0.55);
  });
});

describe("scaledDimensions", () => {
  it("scales and never drops below 1px", () => {
    expect(scaledDimensions(4000, 3000, 0.5)).toEqual({ width: 2000, height: 1500 });
    expect(scaledDimensions(2, 2, 0.25)).toEqual({ width: 1, height: 1 });
  });
});
