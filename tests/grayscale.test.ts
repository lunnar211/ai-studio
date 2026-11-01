import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { analyzeImageLocal, GRAYSCALE_CHROMA_THRESHOLD, recommendFromLocal } from "../lib/ai/image-analysis";

async function grayImage(w = 200, h = 150): Promise<Buffer> {
  // True grayscale: every pixel has R == G == B (a gradient + noise).
  const px = w * h;
  const raw = Buffer.alloc(px);
  for (let i = 0; i < px; i++) raw[i] = (i * 7) % 256;
  return sharp(raw, { raw: { width: w, height: h, channels: 1 } }).jpeg().toBuffer();
}

async function colorImage(w = 200, h = 150): Promise<Buffer> {
  const px = w * h;
  const raw = Buffer.alloc(px * 3);
  for (let i = 0; i < px; i++) {
    raw[i * 3] = (i * 3) % 256;
    raw[i * 3 + 1] = (i * 5 + 40) % 256;
    raw[i * 3 + 2] = (i * 11 + 90) % 256;
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
}

describe("analyzeImageLocal (server grayscale gate)", () => {
  it("classifies a true grayscale image as grayscale", async () => {
    const a = await analyzeImageLocal(await grayImage());
    expect(a.isGrayscale).toBe(true);
    expect(a.kind).toBe("grayscale");
    expect(a.meanChroma).toBeLessThan(GRAYSCALE_CHROMA_THRESHOLD);
  });
  it("classifies a colour image as colour", async () => {
    const a = await analyzeImageLocal(await colorImage());
    expect(a.isGrayscale).toBe(false);
    expect(a.kind).toBe("color");
    expect(a.meanChroma).toBeGreaterThanOrEqual(GRAYSCALE_CHROMA_THRESHOLD);
  });
  it("reports dimensions and alpha honestly", async () => {
    const transparent = await sharp({
      create: { width: 64, height: 48, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
    const a = await analyzeImageLocal(transparent);
    expect(a.width).toBe(64);
    expect(a.height).toBe(48);
    expect(a.hasAlpha).toBe(true);
  });
  it("recommends Colorize for grayscale, Enhance only for large colour", async () => {
    const g = await analyzeImageLocal(await grayImage(1200, 900));
    expect(recommendFromLocal(g)).toBe("Colorize");
    const c = await analyzeImageLocal(await colorImage(1200, 900));
    expect(recommendFromLocal(c)).toBe("Enhance only");
  });
});
