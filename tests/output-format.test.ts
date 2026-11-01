// Unit tests for the Enhance output-size guard
// (lib/ai/output-format.ts): enormous PNG outputs are served as
// JPEG instead, small outputs are untouched, non-PNG buffers pass
// through unchanged, and a conversion failure never breaks a result.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { capOutputSize, isPng, OUTPUT_SIZE_GUARD_BYTES } from "../lib/ai/output-format";

async function noisyPng(width: number, height: number): Promise<Buffer> {
  // Incompressible noise (xorshift PRNG, not a repeating pattern):
  // the PNG stays close to raw size, so a 2200x1600 RGB noise image
  // is well over the 8 MB guard.
  const px = width * height;
  const raw = Buffer.alloc(px * 3);
  let state = 0x12345678;
  for (let i = 0; i < px * 3; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    raw[i] = state & 0xff;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe("capOutputSize", () => {
  it("leaves a small PNG untouched", async () => {
    const small = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).png().toBuffer();
    expect(small.length).toBeLessThan(OUTPUT_SIZE_GUARD_BYTES);
    const out = await capOutputSize(small, "image/png");
    expect(out.mime).toBe("image/png");
    expect(out.buffer.equals(small)).toBe(true);
  });

  it("converts an enormous PNG to a smaller JPEG", async () => {
    const big = await noisyPng(2200, 1600);
    expect(isPng(big)).toBe(true);
    expect(big.length).toBeGreaterThan(OUTPUT_SIZE_GUARD_BYTES);
    const out = await capOutputSize(big, "image/png");
    expect(out.mime).toBe("image/jpeg");
    expect(out.buffer.length).toBeLessThan(big.length);
    expect(isPng(out.buffer)).toBe(false);
  });

  it("passes a large non-PNG buffer through unchanged", async () => {
    const big = Buffer.alloc(OUTPUT_SIZE_GUARD_BYTES + 1024, 7);
    const out = await capOutputSize(big, "image/jpeg");
    expect(out.mime).toBe("image/jpeg");
    expect(out.buffer.equals(big)).toBe(true);
  });
});
