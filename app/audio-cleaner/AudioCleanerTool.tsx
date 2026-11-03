"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cleanAudioChannels,
  gainToDb,
  peakOf,
  encodeWav,
  type CleanSettings,
} from "@/lib/browser/audio-clean";
import { sanitizeFileName } from "@/lib/file-validate";

/**
 * Audio-clean editor (AI Studio Suite Phase 2) — browser-first.
 *
 * The file never leaves this browser: it is decoded with
 * decodeAudioData, cleaned by pure sample math (trim → noise gate →
 * peak normalize), and encoded to WAV here. Only a status row is
 * posted to /api/audio-clean/jobs (tool / status / summary) so the
 * job appears in the user's /account history — no file bytes, no
 * filename, no paid call.
 *
 * Honest capability copy lives here and on the page: a noise gate
 * quiets background sound between speech; it does not remove noise
 * under speech and it is not AI denoising. Cleaning changes sound
 * quality only — never copyright, never ownership.
 */

const MAX_BYTES = 10 * 1024 * 1024;

type Decoded = {
  channels: Float32Array[];
  sampleRate: number;
  durationSec: number;
  channelCount: number;
  isVideo: boolean;
  baseName: string;
};

function formatDb(db: number): string {
  if (!Number.isFinite(db)) return "silence";
  return `${db.toFixed(1)} dB`;
}

export default function AudioCleanerTool() {
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
  const [cleanedStats, setCleanedStats] = useState<string | null>(null);
  const [gateEnabled, setGateEnabled] = useState(true);
  const [gateThresholdDb, setGateThresholdDb] = useState(-45);
  const [normalizeEnabled, setNormalizeEnabled] = useState(true);
  const [trimStart, setTrimStart] = useState("");
  const [trimEnd, setTrimEnd] = useState("");
  const [status, setStatus] = useState<"idle" | "decoding" | "cleaning" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (cleanedUrl) URL.revokeObjectURL(cleanedUrl);
    };
  }, [originalUrl, cleanedUrl]);

  const recordJob = useCallback((ok: boolean, summary: string, errorCode?: string) => {
    // Fire-and-forget: a record failure must never block the preview
    // or download (same rule as server-side logJob).
    void fetch("/api/audio-clean/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: ok ? "SUCCESS" : "FAILED",
        inputSummary: summary.slice(0, 200),
        ...(errorCode ? { errorCode: errorCode.slice(0, 64) } : {}),
      }),
    }).catch(() => {});
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      setCleanedUrl(null);
      setCleanedStats(null);
      setDecoded(null);
      if (file.size > MAX_BYTES) {
        setStatus("error");
        setError("That file is over 10 MB. Please pick a smaller audio file.");
        recordJob(false, "audio-clean file-over-limit", "FILE_TOO_LARGE");
        return;
      }
      setStatus("decoding");
      try {
        const buf = await file.arrayBuffer();
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) throw new Error("This browser cannot decode audio.");
        const ctx = new Ctor();
        try {
          const audio = await ctx.decodeAudioData(buf.slice(0));
          const channels: Float32Array[] = [];
          for (let c = 0; c < audio.numberOfChannels; c++) {
            channels.push(audio.getChannelData(c).slice());
          }
          const isVideo = file.type.startsWith("video/");
          const base = sanitizeFileName(file.name.replace(/\.[^.]*$/, "") || "audio");
          if (originalUrl) URL.revokeObjectURL(originalUrl);
          setOriginalUrl(URL.createObjectURL(file));
          setDecoded({
            channels,
            sampleRate: audio.sampleRate,
            durationSec: audio.duration,
            channelCount: audio.numberOfChannels,
            isVideo,
            baseName: base,
          });
          setTrimStart("");
          setTrimEnd("");
          setStatus("idle");
        } finally {
          await ctx.close().catch(() => {});
        }
      } catch {
        setStatus("error");
        setError("Could not read that file as audio. Please pick an audio file (MP3, WAV, OGG, M4A) or a video file with an audio track.");
        recordJob(false, "audio-clean decode-failed", "DECODE_FAILED");
      }
    },
    [originalUrl, recordJob],
  );

  const onClean = useCallback(() => {
    if (!decoded) return;
    const startSec = trimStart === "" ? null : Number(trimStart);
    const endSec = trimEnd === "" ? null : Number(trimEnd);
    if (
      (startSec !== null && (!Number.isFinite(startSec) || startSec < 0)) ||
      (endSec !== null && (!Number.isFinite(endSec) || endSec < 0)) ||
      (startSec !== null && endSec !== null && startSec >= endSec) ||
      (endSec !== null && endSec > decoded.durationSec)
    ) {
      setStatus("error");
      setError("Trim range is not valid: start must be before end, and both within the file length.");
      return;
    }
    setError(null);
    setStatus("cleaning");
    try {
      const settings: CleanSettings = {
        gate: {
          enabled: gateEnabled,
          thresholdDb: gateThresholdDb,
          attackMs: 10,
          releaseMs: 100,
        },
        normalizeEnabled,
        normalizeTargetDb: -1,
        trimStartSec: startSec,
        trimEndSec: endSec,
      };
      const peakBefore = Math.max(0, ...decoded.channels.map((ch) => peakOf(ch)));
      const { channels, stats } = cleanAudioChannels(decoded.channels, decoded.sampleRate, settings);
      const wav = encodeWav(channels, decoded.sampleRate);
      const blob = new Blob([wav as BlobPart], { type: "audio/wav" });
      if (cleanedUrl) URL.revokeObjectURL(cleanedUrl);
      setCleanedUrl(URL.createObjectURL(blob));
      const outSec = channels.length > 0 ? channels[0].length / decoded.sampleRate : 0;
      setCleanedStats(
        `Peak ${formatDb(gainToDb(peakBefore))} → ${formatDb(stats.peakAfterDb)}` +
          ` · Gate ${stats.gateThresholdDb !== null ? `${stats.gateThresholdDb} dB` : "off"}` +
          ` · Normalize ${normalizeEnabled ? "on (-1 dB peak)" : "off"}` +
          ` · Output ${outSec.toFixed(1)}s WAV 16-bit` +
          (stats.trimmedStartSec !== null || stats.trimmedEndSec !== null
            ? ` · Trimmed ${stats.trimmedStartSec ?? 0}s–${stats.trimmedEndSec ?? decoded.durationSec}s`
            : ""),
      );
      setStatus("done");
      recordJob(
        true,
        `audio-clean ${decoded.durationSec.toFixed(1)}s ${decoded.channelCount}ch ${decoded.sampleRate}Hz -> wav`,
      );
    } catch {
      setStatus("error");
      setError("Cleaning failed for this file. Try different trim values or another file.");
      recordJob(false, "audio-clean clean-failed", "CLEAN_FAILED");
    }
  }, [decoded, trimStart, trimEnd, gateEnabled, gateThresholdDb, normalizeEnabled, cleanedUrl, recordJob]);

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="audio-file" className="font-semibold">
          Pick an audio file (or a video file — only its audio is used)
        </label>
        <input
          ref={fileRef}
          id="audio-file"
          type="file"
          accept="audio/*,video/mp4,video/webm,video/quicktime"
          className="mt-2 block min-h-[44px] w-full rounded-[3px] border-2 border-line bg-white px-3 py-2 dark:bg-slate-900"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        <p className="mt-1 text-sm text-muted-fg dark:text-slate-300">
          Up to 10 MB. MP3, WAV, OGG, M4A, or a video file with an audio
          track. The file never leaves this browser — cleaning happens
          on your device.
        </p>
      </div>

      {decoded && (
        <>
          <p className="text-sm text-muted-fg dark:text-slate-300">
            Loaded: {decoded.durationSec.toFixed(1)}s, {decoded.channelCount} channel
            {decoded.channelCount === 1 ? "" : "s"}, {decoded.sampleRate} Hz.
            {decoded.isVideo &&
              " This is a video file: only its audio is cleaned, the video is discarded, and the download is audio-only (WAV)."}
          </p>

          <div className="space-y-4 rounded-[3px] border-2 border-line bg-white p-4 dark:bg-slate-900">
            <div>
              <label htmlFor="gate-toggle" className="flex min-h-[44px] cursor-pointer items-center gap-2 font-semibold">
                <input
                  id="gate-toggle"
                  type="checkbox"
                  checked={gateEnabled}
                  onChange={(e) => setGateEnabled(e.target.checked)}
                />
                Noise gate (quiets background sound between speech)
              </label>
              {gateEnabled && (
                <div className="mt-2">
                  <label htmlFor="gate-threshold" className="text-sm">
                    Gate threshold: {gateThresholdDb} dB (quieter sounds below this are turned down)
                  </label>
                  <input
                    id="gate-threshold"
                    type="range"
                    min={-60}
                    max={-20}
                    step={1}
                    value={gateThresholdDb}
                    onChange={(e) => setGateThresholdDb(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </div>
              )}
            </div>

            <label htmlFor="normalize-toggle" className="flex min-h-[44px] cursor-pointer items-center gap-2 font-semibold">
              <input
                id="normalize-toggle"
                type="checkbox"
                checked={normalizeEnabled}
                onChange={(e) => setNormalizeEnabled(e.target.checked)}
              />
              Normalize volume (peak to -1 dB)
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="trim-start" className="font-semibold">
                  Trim start (seconds, optional)
                </label>
                <input
                  id="trim-start"
                  type="number"
                  min={0}
                  max={decoded.durationSec}
                  step={0.1}
                  placeholder="0"
                  value={trimStart}
                  onChange={(e) => setTrimStart(e.target.value)}
                  className="mt-1 block min-h-[44px] w-full rounded-[3px] border-2 border-line bg-white px-3 py-2 dark:bg-slate-900"
                />
              </div>
              <div>
                <label htmlFor="trim-end" className="font-semibold">
                  Trim end (seconds, optional)
                </label>
                <input
                  id="trim-end"
                  type="number"
                  min={0}
                  max={decoded.durationSec}
                  step={0.1}
                  placeholder={decoded.durationSec.toFixed(1)}
                  value={trimEnd}
                  onChange={(e) => setTrimEnd(e.target.value)}
                  className="mt-1 block min-h-[44px] w-full rounded-[3px] border-2 border-line bg-white px-3 py-2 dark:bg-slate-900"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={onClean}
              disabled={status === "decoding" || status === "cleaning"}
              className="inline-flex min-h-[44px] cursor-pointer items-center rounded-[3px] border-2 border-brand-dark bg-brand-dark px-4 font-semibold text-white disabled:opacity-50"
            >
              {status === "cleaning" ? "Cleaning…" : "Clean audio"}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-semibold">Before</p>
              {originalUrl && (
                <audio controls src={originalUrl} className="mt-2 w-full" aria-label="Original audio preview" />
              )}
            </div>
            <div>
              <p className="font-semibold">After</p>
              {cleanedUrl ? (
                <audio controls src={cleanedUrl} className="mt-2 w-full" aria-label="Cleaned audio preview" />
              ) : (
                <p className="mt-2 text-sm text-muted-fg dark:text-slate-300">
                  Press “Clean audio” to hear the cleaned version here.
                </p>
              )}
            </div>
          </div>

          {cleanedStats && <p className="text-sm text-muted-fg dark:text-slate-300">{cleanedStats}</p>}

          {cleanedUrl && (
            <a
              href={cleanedUrl}
              download={`cleaned-${decoded.baseName}.wav`}
              className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-accent-dark bg-accent-dark px-4 font-semibold text-white"
            >
              Download cleaned audio (WAV)
            </a>
          )}
        </>
      )}

      {status === "decoding" && <p>Reading your file…</p>}
      {error && (
        <p role="alert" className="rounded-[3px] border-2 border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
