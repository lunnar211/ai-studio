// Tier A (browser DeOldify) + Tier B (Space client) + tier ordering.
//
// The pure tensor/Lab/SSE helpers are tested here. The live ONNX
// session itself cannot run in vitest (no model file, no browser);
// the first real browser run is a documented manual test (see
// SETUP.md), and the code paths around it (worker spawn failure,
// model-download failure) fall back honestly instead of faking.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DEOLDIFY_INPUT_SIZE,
  DEOLDIFY_MODEL_SIZE_ESTIMATE,
  ORT_WEB_VERSION,
  nchwToRgba,
  ortWasmPaths,
  rgbaToNchw,
  runDeoldifyWithTensor,
} from "../lib/browser/deoldify-core";
import { labToRgb, mergeLabLuminance, rgbToLab } from "../lib/browser/lab";
import { colorizeAttemptOrder } from "../lib/ai/tiers";
import {
  parseSpaceSse,
  pollSpaceColorize,
  resolveSpaceFileUrl,
  spaceConfigured,
  spaceHost,
} from "../lib/ai/gradio";

describe("DeOldify tensor conversion (reference spec)", () => {
  it("preprocesses RGBA to NCHW with raw 0-255 values (no /255)", () => {
    // 2x1 image: red pixel, green pixel.
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const nchw = rgbaToNchw(rgba);
    expect(nchw.length).toBe(6);
    expect(Array.from(nchw)).toEqual([255, 0, 0, 255, 0, 0]);
  });
  it("postprocesses NCHW to RGBA with clamping, rounding, opaque alpha", () => {
    const tensor = new Float32Array([300.6, -5.4, 10, 20, 30, 40]);
    const rgba = nchwToRgba(tensor, 2, 1);
    // NCHW: R=[300.6,-5.4]->[255,0], G=[10,20], B=[30,40].
    expect(Array.from(rgba)).toEqual([255, 10, 30, 255, 0, 20, 40, 255]);
  });
  it("runs inference through a stub session with the right feed name and dims", async () => {
    let seenFeeds: Record<string, unknown> | null = null;
    const session = {
      run: async (feeds: Record<string, unknown>) => {
        seenFeeds = feeds;
        // Echo a solid-blue 256x256 output.
        const n = DEOLDIFY_INPUT_SIZE * DEOLDIFY_INPUT_SIZE;
        const data = new Float32Array(n * 3);
        data.fill(0, 0, n);
        data.fill(0, n, 2 * n);
        data.fill(255, 2 * n, 3 * n);
        return { out: { data } };
      },
    };
    const rgba256 = new Uint8ClampedArray(DEOLDIFY_INPUT_SIZE * DEOLDIFY_INPUT_SIZE * 4).fill(128);
    const out = await runDeoldifyWithTensor(session, (data, dims) => ({ data, dims }), rgba256);
    expect(seenFeeds).not.toBeNull();
    const feed = (seenFeeds as unknown as Record<string, { data: Float32Array; dims: number[] }>).input;
    expect(feed.dims).toEqual([1, 3, 256, 256]);
    expect(feed.data.length).toBe(256 * 256 * 3);
    // Output pixel 0 is blue, alpha opaque.
    expect(Array.from(out.slice(0, 4))).toEqual([0, 0, 255, 255]);
  });
});

describe("browser Lab merge", () => {
  it("keeps the original L and scales model chroma by intensity", () => {
    const orig = new Uint8Array([120, 120, 120]); // grey
    const model = new Uint8Array([200, 30, 30]); // reddish
    const origLab = rgbToLab(orig, 1);
    const modelLab = rgbToLab(model, 1);
    const merged70 = mergeLabLuminance(origLab, modelLab, 0.7);
    expect(merged70[0]).toBeCloseTo(origLab[0], 5);
    expect(merged70[1]).toBeCloseTo(modelLab[1] * 0.7, 5);
    const merged0 = mergeLabLuminance(origLab, modelLab, 0);
    expect(merged0[1]).toBe(0);
    expect(merged0[2]).toBe(0);
  });
  it("round-trips grey and red through Lab without tinting grey", () => {
    const grey = new Uint8Array([90, 90, 90]);
    const back = labToRgb(rgbToLab(grey, 1), 1);
    expect(Math.abs(back[0] - back[1])).toBeLessThanOrEqual(1);
    expect(Math.abs(back[1] - back[2])).toBeLessThanOrEqual(1);
    const red = new Uint8Array([200, 30, 30]);
    const backRed = labToRgb(rgbToLab(red, 1), 1);
    expect(backRed[0]).toBeGreaterThan(backRed[1]);
  });
});

describe("onnxruntime-web version pin", () => {
  it("ORT_WEB_VERSION matches the installed package (wasm CDN stays in sync)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    const installed = (pkg.dependencies["onnxruntime-web"] ?? "").replace(/^[^\d]*/, "");
    expect(ORT_WEB_VERSION).toBe(installed);
    expect(ortWasmPaths()).toContain(ORT_WEB_VERSION);
  });
  it("documents the ~64 MB model size estimate", () => {
    // Measured 2026-11-01 from the model host (64,020,138 bytes);
    // the old ~25 MB figure was wrong and misled the download UI.
    expect(DEOLDIFY_MODEL_SIZE_ESTIMATE).toBe(64 * 1024 * 1024);
  });
});

describe("tier ordering", () => {
  it("Free uses the free server route only (never paid GPU); Premium tries paid GPU first, then the Space", () => {
    expect(colorizeAttemptOrder("FREE")).toEqual(["space"]);
    expect(colorizeAttemptOrder("PREMIUM")).toEqual(["replicate", "space"]);
  });
});

describe("Space client helpers", () => {
  const savedEnv = { ...process.env };
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    process.env = { ...savedEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("spaceConfigured is false without HF_SPACE_ID, true with it", () => {
    delete process.env.HF_SPACE_ID;
    expect(spaceConfigured()).toBe(false);
    process.env.HF_SPACE_ID = "owner/my-space";
    expect(spaceConfigured()).toBe(true);
  });
  it("derives the Space host, with HF_SPACE_HOST override", () => {
    delete process.env.HF_SPACE_HOST;
    process.env.HF_SPACE_ID = "owner/my-space";
    expect(spaceHost()).toBe("https://owner-my-space.hf.space");
    process.env.HF_SPACE_HOST = "https://custom.example.com/";
    expect(spaceHost()).toBe("https://custom.example.com");
  });
  it("parses Gradio SSE: complete, error, and still-running", () => {
    const complete =
      "event: generating\ndata: []\n\n" +
      "event: complete\ndata: [{\"path\": \"/tmp/gradio/out.png\", \"url\": \"/gradio_api/file=/tmp/gradio/out.png\"}]\n\n";
    const parsed = parseSpaceSse(complete);
    expect(parsed?.event).toBe("complete");
    expect((parsed?.data as Array<{ path: string }>)[0].path).toBe("/tmp/gradio/out.png");
    expect(parseSpaceSse("event: generating\ndata: []\n\n")).toBeNull();
    const err = parseSpaceSse("event: error\ndata: \"boom\"\n\n");
    expect(err?.event).toBe("error");
    expect(err?.data).toBe("boom");
  });
  it("resolves Gradio file outputs to fetchable URLs", () => {
    const host = "https://owner-my-space.hf.space";
    expect(resolveSpaceFileUrl({ url: "https://cdn.example.com/x.png" }, host)).toBe("https://cdn.example.com/x.png");
    expect(resolveSpaceFileUrl({ url: "/gradio_api/file=/tmp/a.png" }, host)).toBe(
      "https://owner-my-space.hf.space/gradio_api/file=/tmp/a.png"
    );
    expect(resolveSpaceFileUrl({ path: "/tmp/b.png" }, host)).toBe(
      "https://owner-my-space.hf.space/gradio_api/file=/tmp/b.png"
    );
    expect(resolveSpaceFileUrl({}, host)).toBeNull();
  });
  it("polls a Space event: processing, succeeded (file fetch), expired", async () => {
    process.env.HF_SPACE_ID = "owner/my-space";
    delete process.env.HF_SPACE_HOST;
    const fetchMock = vi.mocked(fetch);
    // Still running.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "event: generating\ndata: []\n\n",
    } as Response);
    await expect(pollSpaceColorize("evt-1")).resolves.toEqual({ status: "processing" });
    // Completed with a file output, then the file itself.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        "event: complete\ndata: [{\"url\": \"/gradio_api/file=/tmp/gradio/out.png\"}]\n\n",
    } as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as Response);
    const done = await pollSpaceColorize("evt-2");
    expect(done.status).toBe("succeeded");
    if (done.status === "succeeded") expect(Array.from(done.image)).toEqual([1, 2, 3]);
    // Gone event id -> honest expired failure, not a hang.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "",
    } as Response);
    const gone = await pollSpaceColorize("evt-3");
    expect(gone.status).toBe("failed");
  });
});
