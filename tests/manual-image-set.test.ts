import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { detectImageKind } from "../lib/file-validate";
import { analyzeImageLocal } from "../lib/ai/image-analysis";
import { normalizeUpload, prepareAiInput } from "../lib/ai/colorize";

// The brief's manual test set, as a regression test: every image is
// generated here with sharp (no fixtures, no copyrighted photos).
async function grayPortrait(w = 800, h = 1000): Promise<Buffer> {
  // Smooth radial "portrait" gradient + light noise, grayscale.
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g" cx="50%" cy="35%"><stop offset="0%" stop-color="#ddd"/><stop offset="100%" stop-color="#333"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 70 }).toBuffer();
}

async function noisyScan(w = 1500, h = 2000): Promise<Buffer> {
  // True incompressible noise via a seeded PRNG (a periodic pattern
  // would compress to kilobytes and defeat the point of the test).
  const px = w * h;
  const raw = Buffer.alloc(px * 3);
  let seed = 0x12345678;
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) % 256;
  };
  for (let i = 0; i < px * 3; i++) raw[i] = next();
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

describe("manual image set (brief §6)", () => {
  it("100KB-class B&W portrait: valid grayscale JPEG", async () => {
    const buf = await grayPortrait();
    expect(buf.length).toBeGreaterThan(10 * 1024);
    expect(buf.length).toBeLessThan(10 * 1024 * 1024);
    expect(detectImageKind(buf)).toBe("jpeg");
    const a = await analyzeImageLocal(buf);
    expect(a.isGrayscale).toBe(true);
  });
  it("9.9MB-class scan: large PNG under the 10 MB limit", async () => {
    const buf = await noisyScan();
    expect(buf.length).toBeGreaterThan(5 * 1024 * 1024);
    expect(buf.length).toBeLessThan(10 * 1024 * 1024);
    expect(detectImageKind(buf)).toBe("png");
  });
  it("colour photo: detected as colour, not grayscale", async () => {
    const raw = Buffer.alloc(200 * 150 * 3);
    for (let i = 0; i < 200 * 150; i++) {
      raw[i * 3] = 200;
      raw[i * 3 + 1] = 30;
      raw[i * 3 + 2] = 30;
    }
    const buf = await sharp(raw, { raw: { width: 200, height: 150, channels: 3 } }).jpeg().toBuffer();
    expect((await analyzeImageLocal(buf)).isGrayscale).toBe(false);
  });
  it("corrupted file: rejected by magic bytes", async () => {
    const buf = Buffer.from("this is not an image at all, just random bytes 12345");
    expect(detectImageKind(buf)).toBeNull();
  });
  it("transparent PNG: kind png with alpha", async () => {
    const buf = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } },
    }).png().toBuffer();
    expect(detectImageKind(buf)).toBe("png");
    expect((await analyzeImageLocal(buf)).hasAlpha).toBe(true);
  });
  it("rotated phone photo: EXIF orientation is applied by normalizeUpload", async () => {
    // Stored 600x800 with orientation 6 (rotate 90° CW) => displayed 800x600.
    const buf = await sharp({
      create: { width: 600, height: 800, channels: 3, background: { r: 120, g: 120, b: 120 } },
    }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const out = await normalizeUpload(buf);
    expect(out.width).toBe(800);
    expect(out.height).toBe(600);
  });
  it("tiny thumbnail: analysed without error", async () => {
    const buf = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 90, g: 90, b: 90 } },
    }).jpeg().toBuffer();
    const a = await analyzeImageLocal(buf);
    expect(a.width).toBe(32);
    expect(a.height).toBe(32);
  });
  it("damaged/scratched photo: scratches do not break grayscale detection", async () => {
    const base = await grayPortrait(400, 500);
    const scratches = `<svg width="400" height="500" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="50" x2="400" y2="120" stroke="white" stroke-width="3"/><line x1="100" y1="0" x2="80" y2="500" stroke="white" stroke-width="2"/><line x1="0" y1="400" x2="400" y2="380" stroke="black" stroke-width="2"/></svg>`;
    const buf = await sharp(base).composite([{ input: Buffer.from(scratches) }]).jpeg().toBuffer();
    expect(detectImageKind(buf)).toBe("jpeg");
    expect((await analyzeImageLocal(buf)).isGrayscale).toBe(true);
  });
  it("prepareAiInput caps the longest edge at 1536px", async () => {
    const big = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 100, g: 100, b: 100 } },
    }).jpeg().toBuffer();
    const out = await prepareAiInput(big);
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(1536);
  });
});
