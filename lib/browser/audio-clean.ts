/**
 * Audio-clean pipeline (AI Studio Suite Phase 2) — pure sample math.
 *
 * Browser-first by design: these functions take Float32Array channel
 * data and return new arrays. They never touch the DOM, the network,
 * or any paid provider. The only browser-only step in the editor is
 * decoding (AudioContext.decodeAudioData); encoding is pure WAV here.
 *
 * Style constraint (deliberate, do not break it): this module imports
 * nothing and declares only `export function` / `export const` at the
 * top level, so the Playwright spec can transpile it from source and
 * run the REAL pipeline in Chromium. Keep it that way.
 *
 * Honesty: the "noise reduction" here is a noise GATE — it quiets
 * background sound between speech. It does not remove noise under
 * speech, it is not AI denoising, and nothing here touches copyright:
 * cleaning changes sound quality only.
 */

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  if (gain <= 0) return -Infinity;
  return 20 * Math.log10(gain);
}

export function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

export type GateSettings = {
  enabled: boolean;
  /** dBFS threshold: samples below this are attenuated toward silence. */
  thresholdDb: number;
  /** Envelope attack in milliseconds (how fast the gate opens). */
  attackMs: number;
  /** Envelope release in milliseconds (how fast the gate closes). */
  releaseMs: number;
};

/**
 * Noise gate with attack/release smoothing (no clicks from hard
 * switching). Loud samples pass untouched; quiet samples are scaled
 * down by a smoothed gain that follows the signal envelope. Inputs
 * are never mutated — a new array is returned.
 */
export function applyNoiseGate(
  samples: Float32Array,
  thresholdDb: number,
  sampleRate: number,
  attackMs: number,
  releaseMs: number,
): Float32Array {
  const out = new Float32Array(samples.length);
  const threshold = dbToGain(thresholdDb);
  const attackCoef =
    attackMs <= 0 ? 0 : Math.exp(-1 / (Math.max(1, (attackMs / 1000) * sampleRate)));
  const releaseCoef =
    releaseMs <= 0 ? 0 : Math.exp(-1 / (Math.max(1, (releaseMs / 1000) * sampleRate)));
  let envelope = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > envelope) {
      envelope = attackCoef * envelope + (1 - attackCoef) * abs;
      if (attackMs <= 0) envelope = abs;
    } else {
      envelope = releaseCoef * envelope + (1 - releaseCoef) * abs;
      if (releaseMs <= 0) envelope = abs;
    }
    const gain = envelope >= threshold ? 1 : envelope / threshold;
    out[i] = samples[i] * gain;
  }
  return out;
}

/**
 * Peak normalize: scales so the peak hits targetDb. Silence (peak 0)
 * passes through unchanged with an applied gain of 0 dB. Returns the
 * new samples plus the applied gain, so the UI can report it honestly.
 */
export function normalizePeak(
  samples: Float32Array,
  targetDb: number,
): { samples: Float32Array; appliedGainDb: number } {
  const peak = peakOf(samples);
  if (peak <= 0) return { samples: samples.slice(), appliedGainDb: 0 };
  const target = dbToGain(targetDb);
  const gain = target / peak;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return { samples: out, appliedGainDb: gainToDb(gain) };
}

/**
 * Trim to [startSec, endSec), clamped to the buffer. Throws on an
 * empty or inverted range after clamping — the UI validates first
 * and shows the message; this is the backstop.
 */
export function trimSamples(
  samples: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number,
): Float32Array {
  const durationSec = samples.length / sampleRate;
  const start = Math.max(0, Math.min(durationSec, startSec));
  const end = Math.max(0, Math.min(durationSec, endSec));
  const startIdx = Math.floor(start * sampleRate);
  const endIdx = Math.floor(end * sampleRate);
  if (endIdx <= startIdx) throw new Error("Invalid trim range.");
  return samples.slice(startIdx, endIdx);
}

export type CleanSettings = {
  gate: GateSettings;
  normalizeEnabled: boolean;
  normalizeTargetDb: number;
  trimStartSec: number | null;
  trimEndSec: number | null;
};

export type CleanStats = {
  peakBeforeDb: number;
  peakAfterDb: number;
  gateThresholdDb: number | null;
  trimmedStartSec: number | null;
  trimmedEndSec: number | null;
  appliedGainDb: number;
  outputFormat: string;
};

/**
 * Full clean: trim → gate → normalize, per channel. Order matters:
 * trim first so discarded audio is never processed; gate before
 * normalize so the noise floor is not boosted by the level step.
 */
export function cleanAudioChannels(
  channels: Float32Array[],
  sampleRate: number,
  settings: CleanSettings,
): { channels: Float32Array[]; stats: CleanStats } {
  let peakBefore = 0;
  for (const ch of channels) {
    const p = peakOf(ch);
    if (p > peakBefore) peakBefore = p;
  }
  let worked: Float32Array[] = channels.map((ch) => ch.slice());
  let trimmedStartSec: number | null = null;
  let trimmedEndSec: number | null = null;
  if (settings.trimStartSec !== null || settings.trimEndSec !== null) {
    const durationSec = channels.length > 0 ? channels[0].length / sampleRate : 0;
    const start = settings.trimStartSec ?? 0;
    const end = settings.trimEndSec ?? durationSec;
    worked = worked.map((ch) => trimSamples(ch, sampleRate, start, end));
    trimmedStartSec = start;
    trimmedEndSec = end;
  }
  if (settings.gate.enabled) {
    worked = worked.map((ch) =>
      applyNoiseGate(
        ch,
        settings.gate.thresholdDb,
        sampleRate,
        settings.gate.attackMs,
        settings.gate.releaseMs,
      ),
    );
  }
  let appliedGainDb = 0;
  if (settings.normalizeEnabled) {
    const normalized = worked.map((ch) => normalizePeak(ch, settings.normalizeTargetDb));
    appliedGainDb = normalized.length > 0 ? normalized[0].appliedGainDb : 0;
    worked = normalized.map((n) => n.samples);
  }
  let peakAfter = 0;
  for (const ch of worked) {
    const p = peakOf(ch);
    if (p > peakAfter) peakAfter = p;
  }
  return {
    channels: worked,
    stats: {
      peakBeforeDb: gainToDb(peakBefore),
      peakAfterDb: gainToDb(peakAfter),
      gateThresholdDb: settings.gate.enabled ? settings.gate.thresholdDb : null,
      trimmedStartSec,
      trimmedEndSec,
      appliedGainDb,
      outputFormat: "wav-16bit",
    },
  };
}

/**
 * Encode channels as 16-bit PCM WAV (interleaved), standard RIFF
 * header. Pure JS — no encoder dependency, no browser API.
 */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const numChannels = Math.max(1, channels.length);
  const length = channels.length > 0 ? channels[0].length : 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const ch = channels[c];
      const sample = ch && i < ch.length ? ch[i] : 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 32768 : clamped * 32767, true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer);
}
