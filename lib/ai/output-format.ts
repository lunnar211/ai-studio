// Output-size guard for the Enhance route.
//
// A noisy input can upscale into an enormous PNG (a 3.1 MB input
// once produced a 37 MB PNG). The client renders the result blob
// regardless of type, so when a PNG output would be enormous it is
// served as JPEG instead. Small outputs are untouched. Conversion
// failure falls back to the original buffer — never a broken result.

import sharp from "sharp";

/** PNG outputs bigger than this are served as JPEG instead. */
export const OUTPUT_SIZE_GUARD_BYTES = 8 * 1024 * 1024;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export function isPng(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).equals(PNG_MAGIC);
}

export async function capOutputSize(
  buffer: Buffer,
  currentMime: string
): Promise<{ buffer: Buffer; mime: string }> {
  if (buffer.length <= OUTPUT_SIZE_GUARD_BYTES) return { buffer, mime: currentMime };
  if (!isPng(buffer)) return { buffer, mime: currentMime };
  try {
    const jpeg = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
    return { buffer: jpeg, mime: "image/jpeg" };
  } catch {
    return { buffer, mime: currentMime };
  }
}
