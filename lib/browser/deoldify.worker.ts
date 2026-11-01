// Web Worker for browser colorize: runs the DeOldify ONNX session
// off the main thread so the page stays responsive during inference.
//
// Protocol (main thread <-> worker):
//   -> { type: "colorize", id, rgba, width, height }  (rgba transferred)
//   <- { type: "progress", id, received, total }
//   <- { type: "result", id, rgba }                  (rgba transferred)
//   <- { type: "error", id, message }
// The session is cached in the worker across messages, so repeat runs
// skip the model download (Cache API) and session creation.
// Canvas work stays on the main thread (no OffscreenCanvas dependency);
// this worker only does tensor math.

import {
  DEOLDIFY_INPUT_SIZE,
  fetchDeoldifyModel,
  ortWasmPaths,
  runDeoldifyWithTensor,
} from "./deoldify-core";

type Incoming = {
  type: "colorize";
  id: number;
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
};

type OrtSession = {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>>;
};

type OrtModule = {
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
  InferenceSession: {
    create: (
      model: Uint8Array,
      options?: { executionProviders?: string[] }
    ) => Promise<OrtSession>;
  };
  env: { wasm: { wasmPaths?: string } };
};

const ctx = self as unknown as {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<Incoming>) => void) | null;
};

let sessionPromise: Promise<OrtSession> | null = null;

async function ensureSession(id: number): Promise<OrtSession> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const ort = (await import("onnxruntime-web")) as unknown as OrtModule;
    // WASM fallback files are NOT bundled with the app (they would
    // bloat the deploy); they load from the jsDelivr CDN at the pinned
    // version. WebGPU (tried first) needs no wasm files at all.
    try {
      ort.env.wasm.wasmPaths = ortWasmPaths();
    } catch {
      // Older ort builds without env.wasm: ignore, providers still try.
    }
    const model = await fetchDeoldifyModel((received, total) => {
      ctx.postMessage({ type: "progress", id, received, total });
    });
    const session = await ort.InferenceSession.create(new Uint8Array(model), {
      executionProviders: ["webgpu", "wasm"],
    });
    return session;
  })();
  try {
    return await sessionPromise;
  } catch (err) {
    // A failed session must not poison later retries (e.g. the user
    // goes online again and re-runs).
    sessionPromise = null;
    throw err;
  }
}

ctx.onmessage = async (event: MessageEvent<Incoming>) => {
  const msg = event.data;
  if (!msg || msg.type !== "colorize") return;
  const { id, rgba, width, height } = msg;
  try {
    if (width !== DEOLDIFY_INPUT_SIZE || height !== DEOLDIFY_INPUT_SIZE) {
      throw new Error(`Worker expected a ${DEOLDIFY_INPUT_SIZE}x${DEOLDIFY_INPUT_SIZE} image.`);
    }
    const session = await ensureSession(id);
    const ort = (await import("onnxruntime-web")) as unknown as OrtModule;
    const out = await runDeoldifyWithTensor(
      session,
      (data, dims) => new ort.Tensor("float32", data, dims),
      rgba
    );
    ctx.postMessage({ type: "result", id, rgba: out }, [out.buffer]);
  } catch (err) {
    ctx.postMessage({
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Browser colorize failed.",
    });
  }
};
