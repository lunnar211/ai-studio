// Server tier ordering + Space client + Lab merge helpers.
//
// Formerly tests/browser-tiers.test.ts: the DeOldify tensor and
// onnxruntime-web version sections were deleted with the browser
// model (removed after it kept crashing tabs on memory). What
// remains is server-only: the Space client, the server tier order,
// and the Lab helpers (lib/browser/lab.ts is still used by tests
// and kept).

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { labToRgb, mergeLabLuminance, rgbToLab } from "../lib/browser/lab";
import { colorizeAttemptOrder } from "../lib/ai/tiers";
import {
  parseSpaceSse,
  pollSpaceColorize,
  resolveSpaceFileUrl,
  spaceConfigured,
  spaceHost,
} from "../lib/ai/gradio";

describe("Lab merge", () => {
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

describe("tier ordering", () => {
  it("Free tries Space then Gemini (never paid GPU); Premium tries paid GPU first, then Space, then Gemini", () => {
    // Owner-authorized 2026-11-01: Gemini Nano Banana joins the order
    // after the free Space (see tiers.ts). FREE still never touches
    // Replicate paid GPU.
    expect(colorizeAttemptOrder("FREE")).toEqual(["space", "gemini"]);
    expect(colorizeAttemptOrder("FREE")).not.toContain("replicate");
    expect(colorizeAttemptOrder("PREMIUM")).toEqual(["replicate", "space", "gemini"]);
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
