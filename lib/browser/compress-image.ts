// Client-side pre-upload compression for the photo tool.
//
// WHY THIS EXISTS: serverless requests have a hard size limit (about
// 4.5 MB on the hosting platform), while the tool promises uploads up
// to 10 MB. Any photo between those two numbers used to die on the
// server with a plain-text "too large" response that the client could
// not parse, surfacing as a bare generic failure. The fix is here,
// not on the server: photos over the limit are shrunk in the browser
// (canvas, stepwise smaller dimensions + lower JPEG quality) until
// the upload blob is under the limit, then that blob is uploaded.
// Photos already under the limit upload untouched, byte for byte.
// If compression itself fails (no canvas, unreadable file), the
// original file is returned so the upload still tries — and the
// server's honest size error (or the client's too-large message)
// explains the failure instead of a silent one.
//
// This module is deliberately split: the sizing loop is pure (no DOM)
// so it is unit-tested in tests/compress-image.test.ts, while only
// compressForUpload touches canvas/Image (browser-only, covered by
// the owner preview check with a real large phone photo).

/** Upload blobs must stay under this size (serverless request limit). */
export const UPLOAD_BLOB_LIMIT_BYTES = 4 * 1024 * 1024;

/** Files bigger than this are compressed before upload. */
export const COMPRESS_ABOVE_BYTES = UPLOAD_BLOB_LIMIT_BYTES;

/** Longest edge of the first compression render (input pixels beyond
 *  this add nothing: the server caps free output at 2048px anyway). */
export const COMPRESS_MAX_EDGE = 4096;

/** Hard stop for the shrinking loop — it must always terminate. */
export const MAX_COMPRESSION_STEPS = 12;

export interface CompressionStep {
  /** Multiply both dimensions by this (1 = original size). */
  scale: number;
  /** JPEG quality, 0..1. */
  quality: number;
}

export function needsCompression(fileSizeBytes: number): boolean {
  return fileSizeBytes > COMPRESS_ABOVE_BYTES;
}

export function firstCompressionStep(naturalWidth: number, naturalHeight: number): CompressionStep {
  const longest = Math.max(naturalWidth, naturalHeight, 1);
  const scale = Math.min(1, COMPRESS_MAX_EDGE / longest);
  return { scale, quality: 0.92 };
}

/**
 * Next step of the shrinking loop: 15% smaller each step, quality
 * down 0.07 each step, with floors. Returns null at the floor so the
 * loop always terminates (at most MAX_COMPRESSION_STEPS steps).
 */
export function nextCompressionStep(prev: CompressionStep): CompressionStep | null {
  const scale = Math.max(0.25, prev.scale * 0.85);
  const quality = Math.max(0.55, +(prev.quality - 0.07).toFixed(2));
  if (scale === prev.scale && quality === prev.quality) return null;
  return { scale, quality };
}

/** The full step sequence from a starting step until the floor. */
export function compressionStepSequence(start: CompressionStep): CompressionStep[] {
  const steps: CompressionStep[] = [start];
  let cur = start;
  while (steps.length < MAX_COMPRESSION_STEPS) {
    const next = nextCompressionStep(cur);
    if (!next) break;
    steps.push(next);
    cur = next;
  }
  return steps;
}

export function scaledDimensions(width: number, height: number, scale: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

function renderJpeg(img: HTMLImageElement, step: CompressionStep): Promise<Blob | null> {
  const { width, height } = scaledDimensions(img.naturalWidth, img.naturalHeight, step.scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", step.quality));
}

export interface CompressedUpload {
  /** What to upload (the original file when no compression happened). */
  file: File;
  compressed: boolean;
  originalSize: number;
  finalSize: number;
}

export async function compressForUpload(file: File): Promise<CompressedUpload> {
  const originalSize = file.size;
  if (!needsCompression(originalSize)) {
    return { file, compressed: false, originalSize, finalSize: originalSize };
  }
  try {
    const img = await loadImage(file);
    let step = firstCompressionStep(img.naturalWidth, img.naturalHeight);
    let blob = await renderJpeg(img, step);
    let steps = 0;
    while (blob && blob.size >= UPLOAD_BLOB_LIMIT_BYTES && steps < MAX_COMPRESSION_STEPS) {
      const next = nextCompressionStep(step);
      if (!next) break;
      step = next;
      blob = await renderJpeg(img, step);
      steps++;
    }
    if (!blob || blob.size >= UPLOAD_BLOB_LIMIT_BYTES) {
      // Could not get under the limit: upload the smallest render we
      // got (still better than the original), or the original if the
      // canvas path failed entirely. The server/client too-large
      // message explains a failure honestly.
      if (blob) {
        const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        return { file: new File([blob], name, { type: "image/jpeg" }), compressed: true, originalSize, finalSize: blob.size };
      }
      return { file, compressed: false, originalSize, finalSize: originalSize };
    }
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return { file: new File([blob], name, { type: "image/jpeg" }), compressed: true, originalSize, finalSize: blob.size };
  } catch {
    return { file, compressed: false, originalSize, finalSize: originalSize };
  }
}
