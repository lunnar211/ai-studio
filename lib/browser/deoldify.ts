// Main-thread API for browser colorize (Tier A).
//
// Flow: decode -> 256x256 -> DeOldify ONNX (Web Worker if possible,
// main thread otherwise) -> upscale colour output to the original
// size -> LAB-merge (original L + model a/b, intensity-scaled) ->
// PNG blob. The photo never leaves the device on this path.
//
// Limits, stated honestly: the model input is fixed 256x256, so very
// fine detail is estimated, not recovered; output is capped at 2048px
// longest edge (the same cap as Free server colorize) to keep canvas
// work safe on phones. Colour style / era options do not apply here
// (DeOldify takes no style input); they apply to server colorize.

import {
  DEOLDIFY_INPUT_SIZE,
  DEOLDIFY_MODEL_SIZE_ESTIMATE,
  fetchDeoldifyModel,
  ortWasmPaths,
  runDeoldifyWithTensor,
  toGrayscale,
} from "./deoldify-core";
import { mergeColorizeBanded } from "./lab";

export const BROWSER_COLORIZE_MAX_EDGE = 2048;
export const BROWSER_COLORIZE_ENGINE = "browser-ai-colorize";
export const BROWSER_COLORIZE_PROVIDER = "deoldify-onnx";
export const BROWSER_COLORIZE_MODEL = "deoldify.quant.onnx";

export type BrowserColorizeProgress =
  | { stage: "downloading-model"; receivedBytes: number; totalBytes: number | null }
  | { stage: "colorizing" }
  | { stage: "finishing" };

export type BrowserColorizeResult = {
  blob: Blob;
  width: number;
  height: number;
  engine: string;
  provider: string;
  model: string;
};

export function browserColorizeSupported(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      typeof WebAssembly !== "undefined" &&
      typeof document !== "undefined" &&
      typeof document.createElement("canvas").getContext === "function" &&
      (typeof Worker !== "undefined" || typeof fetch !== "undefined")
    );
  } catch {
    return false;
  }
}

async function decodeImage(file: Blob): Promise<{
  width: number;
  height: number;
  drawTo: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  close: () => void;
}> {
  // close() releases the decoded image as soon as the two small
  // draws are done. Without it, a full-size phone photo (a 12 MP
  // decode is ~48 MB) stays referenced through the whole model run
  // + merge — on a phone that is the difference between finishing
  // and the browser killing the tab (2026-11-01 iPhone crash report).
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file);
    let source: ImageBitmap | null = bmp;
    return {
      width: bmp.width,
      height: bmp.height,
      drawTo: (ctx, w, h) => {
        if (source) ctx.drawImage(source, 0, 0, w, h);
      },
      close: () => {
        try {
          bmp.close();
        } catch {
          // Already closed.
        }
        source = null;
      },
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = url;
    });
    let source: HTMLImageElement | null = img;
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      drawTo: (ctx, w, h) => {
        if (source) ctx.drawImage(source, 0, 0, w, h);
      },
      close: () => {
        source = null;
      },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  return { canvas, ctx };
}

/**
 * Release a canvas's backing store immediately instead of waiting
 * for garbage collection: setting width to 0 frees the backing
 * store in Chromium. Use only for canvases whose pixels have
 * already been copied out (getImageData) and are never drawn from
 * again — the canvas is unusable afterwards.
 */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

function stripAlpha(rgba: Uint8ClampedArray): Uint8Array {
  const pixels = rgba.length / 4;
  const rgb = new Uint8Array(pixels * 3);
  for (let p = 0; p < pixels; p++) {
    rgb[p * 3] = rgba[p * 4];
    rgb[p * 3 + 1] = rgba[p * 4 + 1];
    rgb[p * 3 + 2] = rgba[p * 4 + 2];
  }
  return rgb;
}

type WorkerResult = { type: "result"; rgba: Uint8ClampedArray };
type WorkerError = { type: "error"; message: string };
type WorkerProgress = { type: "progress"; received: number; total: number | null };

function runViaWorker(
  rgba256: Uint8ClampedArray,
  onProgress: (p: BrowserColorizeProgress) => void
): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./deoldify.worker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Web Worker unavailable."));
      return;
    }
    const cleanup = () => {
      try {
        worker.terminate();
      } catch {
        // Already gone.
      }
    };
    worker.onmessage = (event: MessageEvent<WorkerResult | WorkerError | WorkerProgress>) => {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === "progress") {
        onProgress({ stage: "downloading-model", receivedBytes: msg.received, totalBytes: msg.total });
        return;
      }
      if (msg.type === "result") {
        cleanup();
        resolve(msg.rgba);
        return;
      }
      if (msg.type === "error") {
        cleanup();
        reject(new Error(msg.message || "Browser colorize failed."));
      }
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("The colorize worker could not start."));
    };
    worker.postMessage(
      { type: "colorize", id: 1, rgba: rgba256, width: DEOLDIFY_INPUT_SIZE, height: DEOLDIFY_INPUT_SIZE },
      [rgba256.buffer]
    );
  });
}

async function runOnMainThread(
  rgba256: Uint8ClampedArray,
  onProgress: (p: BrowserColorizeProgress) => void
): Promise<Uint8ClampedArray> {
  const ort = (await import("onnxruntime-web")) as unknown as {
    Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
    InferenceSession: {
      create: (
        model: Uint8Array,
        options?: { executionProviders?: string[]; enableCpuMemArena?: boolean }
      ) => Promise<{ run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>> }>;
    };
    env: { wasm: { wasmPaths?: string } };
  };
  try {
    ort.env.wasm.wasmPaths = ortWasmPaths();
  } catch {
    // Ignore; providers still try.
  }
  const model = await fetchDeoldifyModel((received, total) => {
    onProgress({ stage: "downloading-model", receivedBytes: received, totalBytes: total });
  });
  onProgress({ stage: "colorizing" });
  const session = await ort.InferenceSession.create(new Uint8Array(model), {
    executionProviders: ["webgpu", "wasm"],
    // No CPU memory arena — see the worker's note (same measurement).
    enableCpuMemArena: false,
  });
  return runDeoldifyWithTensor(
    session,
    (data, dims) => new ort.Tensor("float32", data, dims),
    rgba256
  );
}

export async function colorizeInBrowser(
  file: Blob,
  opts: { intensityPct?: number; onProgress?: (p: BrowserColorizeProgress) => void } = {}
): Promise<BrowserColorizeResult> {
  const intensity = Math.min(1, Math.max(0, (opts.intensityPct ?? 70) / 100));
  const onProgress = opts.onProgress ?? (() => undefined);
  const decoded = await decodeImage(file);
  const edgeScale = Math.min(1, BROWSER_COLORIZE_MAX_EDGE / Math.max(decoded.width, decoded.height));
  const outW = Math.max(1, Math.round(decoded.width * edgeScale));
  const outH = Math.max(1, Math.round(decoded.height * edgeScale));

  // Original at output size (detail source for the LAB merge).
  const orig = makeCanvas(outW, outH);
  decoded.drawTo(orig.ctx, outW, outH);
  const origRgba = orig.ctx.getImageData(0, 0, outW, outH).data;
  // The original's pixels are copied out: free the canvas backing
  // store NOW, before the model run allocates its peak memory,
  // instead of holding ~13 MB through inference (2026-11-01 repro:
  // the model run is the peak, so every MB held through it counts).
  releaseCanvas(orig.canvas);

  // Model input: squashed to 256x256 (the model's fixed input size),
  // then desaturated to TRUE greyscale before inference. DeOldify
  // was trained on greyscale; a sepia input makes it output
  // purple/blue blotches (proven 2026-11-01: 28.8% blotch pixels
  // with sepia in, 0.8% with grey in). Writing the grey pixels
  // back to the canvas covers BOTH run paths: the worker takes
  // rgba256, and the main-thread fallback re-reads this canvas.
  // The original (detail source for the LAB merge) is untouched.
  const small = makeCanvas(DEOLDIFY_INPUT_SIZE, DEOLDIFY_INPUT_SIZE);
  decoded.drawTo(small.ctx, DEOLDIFY_INPUT_SIZE, DEOLDIFY_INPUT_SIZE);
  const rgba256 = toGrayscale(
    small.ctx.getImageData(0, 0, DEOLDIFY_INPUT_SIZE, DEOLDIFY_INPUT_SIZE).data
  );
  small.ctx.putImageData(
    new ImageData(rgba256, DEOLDIFY_INPUT_SIZE, DEOLDIFY_INPUT_SIZE),
    0,
    0
  );

  // The decoded photo is no longer needed: the model runs on the
  // 256px input and the merge reads the output-size canvas. Release
  // it now, before the model + merge allocate their peak memory.
  decoded.close();

  // Run the model: worker first, main thread if workers are blocked.
  let outRgba256: Uint8ClampedArray;
  try {
    outRgba256 = await runViaWorker(rgba256, onProgress);
  } catch {
    outRgba256 = await runOnMainThread(
      small.ctx.getImageData(0, 0, DEOLDIFY_INPUT_SIZE, DEOLDIFY_INPUT_SIZE).data,
      onProgress
    );
  }
  onProgress({ stage: "finishing" });

  // Upscale the 256px colour output to the output size.
  const up = makeCanvas(outW, outH);
  const tmp = makeCanvas(DEOLDIFY_INPUT_SIZE, DEOLDIFY_INPUT_SIZE);
  const tmpData = tmp.ctx.createImageData(DEOLDIFY_INPUT_SIZE, DEOLDIFY_INPUT_SIZE);
  tmpData.data.set(outRgba256);
  tmp.ctx.putImageData(tmpData, 0, 0);
  up.ctx.imageSmoothingEnabled = true;
  up.ctx.imageSmoothingQuality = "high";
  up.ctx.drawImage(tmp.canvas, 0, 0, outW, outH);
  const upRgba = up.ctx.getImageData(0, 0, outW, outH).data;
  // Upscaled pixels are copied out: free both canvases before the
  // merge + PNG encode, so the encode spike does not stack on top
  // of them. (The small 256px canvas is NOT released: the
  // main-thread fallback re-reads it if the worker failed.)
  releaseCanvas(up.canvas);
  releaseCanvas(tmp.canvas);

  // LAB merge: original L + model a/b, intensity-scaled, in bands
  // (see mergeColorizeBanded: exact output, far lower peak memory
  // than the old whole-image version — the phone crash fix).
  const mergedRgba = mergeColorizeBanded(
    stripAlpha(origRgba),
    stripAlpha(upRgba),
    outW,
    outH,
    intensity
  );
  const final = makeCanvas(outW, outH);
  final.ctx.putImageData(new ImageData(mergedRgba, outW, outH), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    final.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the colorized photo."))), "image/png");
  });
  return {
    blob,
    width: outW,
    height: outH,
    engine: BROWSER_COLORIZE_ENGINE,
    provider: BROWSER_COLORIZE_PROVIDER,
    model: BROWSER_COLORIZE_MODEL,
  };
}

/** Human-readable model-download progress for the UI. */
export function formatModelProgress(p: BrowserColorizeProgress): string {
  if (p.stage !== "downloading-model") return "";
  const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
  const total = p.totalBytes ?? DEOLDIFY_MODEL_SIZE_ESTIMATE;
  const pct = Math.min(100, Math.round((p.receivedBytes / total) * 100));
  return `Downloading the colorize model (one-time) — ${mb(p.receivedBytes)} MB of ${mb(total)} MB (${pct}%). After this it is cached on your device.`;
}
