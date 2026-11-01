import { describe, expect, it } from "vitest";
import { detectImageKind, sanitizeFileName } from "../lib/file-validate";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Buffer.from([...Buffer.from("RIFF"), 0x10, 0x00, 0x00, 0x00, ...Buffer.from("WEBP")]);
const GIF = Buffer.from("GIF89a");
const TEXT = Buffer.from("hello, this is not an image");

describe("detectImageKind (magic bytes, not extension)", () => {
  it("detects jpeg/png/webp by header", () => {
    expect(detectImageKind(JPEG)).toBe("jpeg");
    expect(detectImageKind(PNG)).toBe("png");
    expect(detectImageKind(WEBP)).toBe("webp");
  });
  it("rejects gif, text and empty buffers", () => {
    expect(detectImageKind(GIF)).toBeNull();
    expect(detectImageKind(TEXT)).toBeNull();
    expect(detectImageKind(Buffer.alloc(0))).toBeNull();
  });
  it("rejects truncated headers", () => {
    expect(detectImageKind(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectImageKind(Buffer.from([0x89, 0x50]))).toBeNull();
  });
  it("rejects a renamed file: gif bytes with a .jpg name still fail (kind comes from bytes)", () => {
    // The route never looks at the extension; only this function decides.
    expect(detectImageKind(GIF)).not.toBe("jpeg");
  });
});

describe("sanitizeFileName", () => {
  it("strips path separators and keeps safe chars", () => {
    expect(sanitizeFileName("../../etc/passwd")).not.toContain("/");
    expect(sanitizeFileName("my photo (1).jpg")).toBe("my_photo__1_.jpg");
  });
  it("falls back to 'upload' for empty names", () => {
    expect(sanitizeFileName("")).toBe("upload");
  });
});
