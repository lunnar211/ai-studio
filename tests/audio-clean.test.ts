import { describe, expect, it } from "vitest";
import {
  applyNoiseGate,
  cleanAudioChannels,
  dbToGain,
  encodeWav,
  gainToDb,
  normalizePeak,
  peakOf,
  trimSamples,
} from "../lib/browser/audio-clean";
import { POST } from "../app/api/audio-clean/jobs/route";

/**
 * Audio-clean pipeline tests — generated tones only. No fixtures, no
 * real audio, no copyrighted material anywhere in this file.
 */

function sine(length: number, amplitude: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * i) / 100);
  }
  return out;
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / Math.max(1, samples.length));
}

describe("db helpers", () => {
  it("round-trips gain and dB", () => {
    expect(gainToDb(dbToGain(-20))).toBeCloseTo(-20, 6);
    expect(gainToDb(0)).toBe(-Infinity);
    expect(peakOf(new Float32Array([0.1, -0.5, 0.3]))).toBeCloseTo(0.5, 6);
  });
});

describe("noise gate", () => {
  it("passes loud samples untouched and attenuates quiet ones", () => {
    const loud = sine(1000, 0.8);
    const gated = applyNoiseGate(loud, -40, 44100, 10, 100);
    expect(rms(gated)).toBeCloseTo(rms(loud), 2);
    const quiet = sine(1000, 0.001);
    const gatedQuiet = applyNoiseGate(quiet, -40, 44100, 10, 100);
    expect(rms(gatedQuiet)).toBeLessThan(rms(quiet) * 0.5);
  });

  it("never mutates its input", () => {
    const input = sine(500, 0.3);
    const before = input.slice();
    applyNoiseGate(input, -40, 44100, 10, 100);
    expect(input).toEqual(before);
  });
});

describe("normalize", () => {
  it("scales the peak to the target and reports the gain", () => {
    const input = sine(1000, 0.25);
    const { samples, appliedGainDb } = normalizePeak(input, -1);
    expect(peakOf(samples)).toBeCloseTo(dbToGain(-1), 4);
    expect(appliedGainDb).toBeGreaterThan(0);
  });

  it("leaves silence alone with 0 dB applied", () => {
    const { samples, appliedGainDb } = normalizePeak(new Float32Array(100), -1);
    expect(peakOf(samples)).toBe(0);
    expect(appliedGainDb).toBe(0);
  });
});

describe("trim", () => {
  it("slices and clamps to the buffer", () => {
    const input = sine(4410, 0.5); // 0.1s at 44100 Hz
    expect(trimSamples(input, 44100, 0.02, 0.05).length).toBe(1323);
    expect(trimSamples(input, 44100, -5, 99).length).toBe(4410);
  });

  it("throws on an empty or inverted range", () => {
    const input = sine(4410, 0.5);
    expect(() => trimSamples(input, 44100, 0.05, 0.02)).toThrow();
    expect(() => trimSamples(input, 44100, 0.05, 0.05)).toThrow();
  });
});

describe("WAV encode", () => {
  it("writes a valid RIFF header and round-trips samples", () => {
    const input = sine(1000, 0.5);
    const bytes = encodeWav([input], 44100);
    const view = new DataView(bytes.buffer);
    const text = (off: number, len: number): string =>
      Array.from(bytes.slice(off, off + len))
        .map((b) => String.fromCharCode(b))
        .join("");
    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(text(36, 4)).toBe("data");
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    // First non-zero sample survives the 16-bit round trip closely.
    const first = view.getInt16(44 + 2 * 25, true) / 32767;
    expect(first).toBeCloseTo(input[25], 2);
  });
});

describe("full clean composition", () => {
  it("trims, then gates, then normalizes, in that order", () => {
    const sr = 44100;
    // 2s: 1s loud sine, 1s quiet noise-like wobble.
    const loud = sine(sr, 0.4);
    const quiet = sine(sr, 0.002);
    const full = new Float32Array(sr * 2);
    full.set(loud, 0);
    full.set(quiet, sr);
    const { channels, stats } = cleanAudioChannels([full], sr, {
      gate: { enabled: true, thresholdDb: -40, attackMs: 10, releaseMs: 100 },
      normalizeEnabled: true,
      normalizeTargetDb: -1,
      trimStartSec: 0.5,
      trimEndSec: 1.5,
    });
    // Trimmed to 1s: 0.5s loud + 0.5s quiet.
    expect(channels[0].length).toBe(sr);
    // Peak normalized to target.
    expect(peakOf(channels[0])).toBeCloseTo(dbToGain(-1), 3);
    // The quiet half is gated well below the loud half.
    const loudHalf = channels[0].slice(0, sr / 2);
    const quietHalf = channels[0].slice(sr / 2);
    expect(rms(quietHalf)).toBeLessThan(rms(loudHalf) * 0.2);
    expect(stats.trimmedStartSec).toBe(0.5);
    expect(stats.trimmedEndSec).toBe(1.5);
    expect(stats.gateThresholdDb).toBe(-40);
    expect(stats.outputFormat).toBe("wav-16bit");
  });

  it("gate off + normalize off leaves samples unchanged", () => {
    const input = sine(1000, 0.3);
    const { channels } = cleanAudioChannels([input], 44100, {
      gate: { enabled: false, thresholdDb: -40, attackMs: 10, releaseMs: 100 },
      normalizeEnabled: false,
      normalizeTargetDb: -1,
      trimStartSec: null,
      trimEndSec: null,
    });
    expect(channels[0]).toEqual(input);
  });
});

describe("audio-clean job-record route", () => {
  it("returns 401 when logged out (auth runs before validation)", async () => {
    const res = await POST(
      new Request("http://localhost/api/audio-clean/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonsense: true }),
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json().catch(() => ({}));
    expect(JSON.stringify(body)).not.toContain("prisma");
  });
});
