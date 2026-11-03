import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// SUITE Phase 2 audio-clean editor, provable WITHOUT live credentials.
// The test server runs without Supabase env vars, so the gated page
// must redirect and the job API must 401 — never render the tool,
// another user's data, or a stack trace. The signed-in full flow
// (upload → clean → preview → download in the real UI) and the
// /account job-row visibility cannot run here without a real session:
// they are proven by code scoping (page gate, logJob tool value,
// /account's generic Job listing) and owed as live checks — see
// docs/SUITE-PHASE2.md QA checklist.
//
// What this file DOES prove in a real Chromium: the REAL pipeline
// module (transpiled from source at spec time with the repo's own
// typescript, `export` keywords stripped) decoding, cleaning, and
// re-encoding a generated tone. No test route is shipped to
// production for this, and no fixture is downloaded.

test("audio cleaner redirects when logged out", async ({ page }) => {
  await page.goto("/audio-cleaner");
  await expect(page).toHaveURL(/\/signin/);
});

test("audio-clean job API requires sign-in (401, not a stack trace)", async ({ request }) => {
  const res = await request.post("/api/audio-clean/jobs", {
    data: { status: "SUCCESS", inputSummary: "audio-clean 1.0s 1ch 44100Hz -> wav" },
  });
  expect(res.status()).toBe(401);
  const body = await res.json().catch(() => ({}));
  expect(JSON.stringify(body)).not.toContain("prisma");
  expect(JSON.stringify(body)).not.toContain("Error:");
});

test("audio-clean job API rejects a bad body only after auth (still 401 logged out)", async ({ request }) => {
  // Order matters: auth runs before validation, so a logged-out caller
  // learns nothing about validation rules from the error shape.
  const res = await request.post("/api/audio-clean/jobs", { data: { nonsense: true } });
  expect(res.status()).toBe(401);
});

test("real pipeline in Chromium: generated tone decodes, cleans, encodes", async ({ page }) => {
  const src = readFileSync(join(__dirname, "../../lib/browser/audio-clean.ts"), "utf8");
  const transpiled = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText;
  // The module uses only top-level `export function` declarations;
  // strip them so the code runs as a plain script in the page.
  const script = transpiled.replace(/^export\s+/gm, "");

  await page.goto("/");
  const result = await page.evaluate(async (code: string) => {
    const run = new Function(
      `${code}\nreturn (async () => {
        const sr = 44100;
        const tone = new Float32Array(sr * 2);
        for (let i = 0; i < sr; i++) tone[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr);
        for (let i = sr; i < sr * 2; i++) tone[i] = 0.005 * Math.sin((2 * Math.PI * 440 * i) / sr);
        const wav = encodeWav([tone], sr);
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(wav.buffer.slice(0));
        const decodedChannel = decoded.getChannelData(0).slice();
        const cleaned = cleanAudioChannels([decodedChannel], sr, {
          gate: { enabled: true, thresholdDb: -40, attackMs: 10, releaseMs: 100 },
          normalizeEnabled: true,
          normalizeTargetDb: -1,
          trimStartSec: 0.5,
          trimEndSec: 1.5,
        });
        const out = cleaned.channels[0];
        const outWav = encodeWav(cleaned.channels, sr);
        const riff = String.fromCharCode(outWav[0], outWav[1], outWav[2], outWav[3]);
        let peak = 0;
        for (const s of out) peak = Math.max(peak, Math.abs(s));
        const rms = (arr) => {
          let sum = 0;
          for (const s of arr) sum += s * s;
          return Math.sqrt(sum / Math.max(1, arr.length));
        };
        const loudHalf = out.slice(0, sr / 2);
        const quietHalf = out.slice(sr / 2);
        await ctx.close().catch(() => {});
        return {
          decodedDuration: decoded.duration,
          outLength: out.length,
          peak,
          quietRatio: rms(quietHalf) / Math.max(1e-9, rms(loudHalf)),
          riff,
          gateThresholdDb: cleaned.stats.gateThresholdDb,
        };
      })();`,
    );
    return run();
  }, script);

  expect(result.decodedDuration).toBeCloseTo(2, 1);
  expect(result.outLength).toBe(44100); // trimmed 0.5s–1.5s = 1s
  expect(result.peak).toBeCloseTo(Math.pow(10, -1 / 20), 2); // normalized to -1 dB
  expect(result.quietRatio).toBeLessThan(0.2); // gated quiet half well below loud half
  expect(result.riff).toBe("RIFF");
  expect(result.gateThresholdDb).toBe(-40);
});
