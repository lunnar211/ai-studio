"use client";
import { trackEvent } from "@/lib/analytics";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/field";
import { TurnstileWidget } from "@/components/site/TurnstileWidget";
import { COLOR_ERAS, COLOR_STYLES } from "@/lib/ai/color-constants";
import {
  browserColorizeSupported,
  colorizeInBrowser,
  formatModelProgress,
  type BrowserColorizeProgress,
} from "@/lib/browser/deoldify";

const MAX_BYTES = 10 * 1024 * 1024;
const POLL_MS = 2500;

type Mode = "enhance" | "colorize" | "restore";
type Caps = {
  colorize: boolean;
  colorizeBlockedReason: string | null;
  serverColorize?: boolean;
  browserColorize?: boolean;
  upscaleAi: boolean;
  photoCreditsFree: number;
  photoCreditsPremium: number;
  photoCreditCost: Record<Mode, number>;
  signedIn: boolean;
  plan: "FREE" | "PREMIUM" | null;
  remainingCredits: number | null;
  creditBudget: number | null;
} | null;

type JobState = {
  jobId: string;
  status: string;
  stage: string;
  mode: Mode;
  credits: number;
  quality?: "ai" | "standard" | null;
  message?: string;
  resultData?: string;
  resultMime?: string;
  resultWidth?: number;
  resultHeight?: number;
  deliveredAs?: string | null;
  note?: string;
  error?: string;
  expired?: boolean;
};

const MODE_CARDS: Array<{ value: Mode; title: string; desc: string }> = [
  { value: "enhance", title: "Enhance", desc: "Sharper, larger version of your photo. Works on any photo." },
  { value: "colorize", title: "Colorize", desc: "Adds estimated colours to a black & white photo, then upscales it." },
  { value: "restore", title: "Restore + Colorize", desc: "Repairs faces and scratches first, then colorizes (black & white) and upscales." },
];

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued…",
  restoring: "Restoring…",
  colorizing: "Colorizing…",
  upscaling: "Upscaling…",
  finalising: "Finalising…",
  done: "Done",
};

/** Local grayscale check in the browser (canvas sampling, no upload).
 *  A warning/suggestion only — the server measures again and enforces. */
async function detectGrayscaleLocal(file: File): Promise<"grayscale" | "color" | null> {
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("load"));
        img.src = url;
      });
      const maxEdge = 256;
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let sum = 0;
      const pixels = w * h;
      for (let p = 0; p < pixels; p++) {
        const o = p * 4;
        sum += Math.max(
          Math.abs(data[o] - data[o + 1]),
          Math.abs(data[o + 1] - data[o + 2]),
          Math.abs(data[o] - data[o + 2])
        );
      }
      return sum / pixels < 8 ? "grayscale" : "color";
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

function dataUriToBlobUrl(dataUri: string, mime: string): string {
  const base64 = dataUri.split(",")[1] ?? dataUri;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

export function EnhancerTool({ initialMode }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode ?? "enhance");
  const [file, setFile] = useState<File | null>(null);
  const [beforeUrl, setBeforeUrl] = useState("");
  const [afterUrl, setAfterUrl] = useState("");
  const [afterName, setAfterName] = useState("enhanced.png");
  const [quality, setQuality] = useState<"ai" | "standard" | null>(null);
  const [outSize, setOutSize] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [slider, setSlider] = useState(50);
  const [compareMode, setCompareMode] = useState<"slider" | "side">("slider");
  const [zoom, setZoom] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestEnhance, setSuggestEnhance] = useState(false);
  const [token, setToken] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [caps, setCaps] = useState<Caps>(null);
  const [grayKind, setGrayKind] = useState<"grayscale" | "color" | null>(null);
  const [grayChecking, setGrayChecking] = useState(false);
  // Advanced (colorize) options.
  const [style, setStyle] = useState("natural");
  const [era, setEra] = useState("");
  const [intensity, setIntensity] = useState(70);
  const [outputFormat, setOutputFormat] = useState("jpg");
  const [outputQuality, setOutputQuality] = useState(85);
  const [scale, setScale] = useState(2);
  const [faceEnhance, setFaceEnhance] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Async job state.
  const [job, setJob] = useState<JobState | null>(null);
  const [jobStage, setJobStage] = useState<string | null>(null);
  const [resultMeta, setResultMeta] = useState<{ quality: "ai" | "standard" | null; deliveredAs?: string | null; note?: string; browser?: boolean } | null>(null);
  // Browser (Tier A) colorize state.
  const [browserSupported, setBrowserSupported] = useState(false);
  const [browserProgress, setBrowserProgress] = useState("");
  const [offerBrowser, setOfferBrowser] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobCancelled = useRef(false);

  const isPremium = caps?.plan === "PREMIUM";
  const cost = caps?.photoCreditCost?.[mode] ?? (mode === "enhance" ? 1 : mode === "colorize" ? 2 : 3);
  const colorizeAvailable = caps?.colorize ?? true;
  const colorizeBlockedReason = caps?.colorizeBlockedReason ?? null;

  useEffect(() => {
    fetch("/api/photo/capabilities")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setCaps(d as Caps);
      })
      .catch(() => null);
    // Browser capability is device-local: detect after mount (never
    // on the server, where window does not exist). Deferred a frame
    // so the effect only synchronizes external device state.
    const raf = requestAnimationFrame(() => setBrowserSupported(browserColorizeSupported()));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Resume: a job id in the URL (?job=) or localStorage re-attaches
  // polling, so leaving the page mid-job does not lose the result.
  // State is set only in the poll's async callback (never synchronously
  // in this effect), so the first poll response populates the UI.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("job") || window.localStorage.getItem("photo-job-id");
    if (jobId) {
      pollJob(jobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  async function pollJob(jobId: string) {
    if (jobCancelled.current) return;
    try {
      const res = await fetch(`/api/photo/jobs/${jobId}`);
      const data = (await res.json().catch(() => null)) as (JobState & { error?: string }) | null;
      if (!res.ok || !data) {
        setError(data?.error ?? "Could not check that job. It may have expired — please run it again.");
        setJobStage(null);
        return;
      }
      const st = data as JobState;
      setJob(st);
      if (st.status === "SUCCEEDED" && st.resultData) {
        setJobStage("finalising");
        const mime = st.resultMime ?? "image/jpeg";
        const url = dataUriToBlobUrl(`data:${mime};base64,${st.resultData}`, mime);
        setAfterUrl(url);
        const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
        setAfterName(`${st.mode === "restore" ? "restored" : "colorized"}.${ext}`);
        setOutSize(st.resultWidth && st.resultHeight ? `${st.resultWidth} × ${st.resultHeight}px` : "");
        setResultMeta({
          quality: st.quality ?? null,
          deliveredAs: st.deliveredAs,
          note: st.note,
        });
        setQuality(st.quality ?? null);
        trackEvent("photo_result");
        setJobStage("done");
        setLoading(false);
        window.localStorage.removeItem("photo-job-id");
        return;
      }
      if (st.status === "SUCCEEDED" && st.expired) {
        setError(st.error ?? "This result expired. Please run the job again.");
        setJobStage(null);
        setLoading(false);
        window.localStorage.removeItem("photo-job-id");
        return;
      }
      if (st.status === "FAILED" || st.status === "CANCELED") {
        setError(st.error ?? "That job failed. Your original is unchanged — please try again.");
        setJobStage(null);
        setLoading(false);
        window.localStorage.removeItem("photo-job-id");
        return;
      }
      setJobStage(st.stage === "restoring" ? "restoring" : st.stage === "colorizing" ? "colorizing" : st.stage === "upscaling" ? "upscaling" : "queued");
      pollTimer.current = setTimeout(() => pollJob(jobId), POLL_MS);
    } catch {
      // Transient poll error: retry once more on the next tick.
      pollTimer.current = setTimeout(() => pollJob(jobId), POLL_MS);
    }
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    stopPolling();
    jobCancelled.current = false;
    setError("");
    setOfferBrowser(false);
    setBrowserProgress("");
    setSuggestEnhance(false);
    setAfterUrl("");
    setQuality(null);
    setResultMeta(null);
    setJob(null);
    setJobStage(null);
    if (f.size > MAX_BYTES) {
      setError("That file is over 10 MB. Please choose a smaller image.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      setError("Please choose a JPG, PNG or WebP image.");
      return;
    }
    setFile(f);
    trackEvent("photo_upload");
    setBeforeUrl(URL.createObjectURL(f));
    setGrayChecking(true);
    const kind = await detectGrayscaleLocal(f);
    setGrayKind(kind);
    setGrayChecking(false);
  }

  function startEnhance() {
    if (!file) return;
    setError("");
    setSuggestEnhance(false);
    setLoading(true);
    setProgress(0);
    const form = new FormData();
    form.append("image", file);
    if (token) form.append("turnstileToken", token);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/enhance", true);
    xhr.responseType = "blob";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setLoading(false);
      setProgress(null);
      if (xhr.status === 200) {
        const eng = xhr.getResponseHeader("X-Quality") || "";
        const w = xhr.getResponseHeader("X-Output-Width") || "";
        const h = xhr.getResponseHeader("X-Output-Height") || "";
        setQuality(eng === "ai" ? "ai" : "standard");
        setOutSize(w && h ? `${w} × ${h}px` : "");
        setAfterName("enhanced.png");
        setAfterUrl(URL.createObjectURL(xhr.response as Blob));
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(String(reader.result)) as { error?: string };
            setError(data.error || "Enhancement failed. Please try again.");
          } catch {
            setError("Enhancement failed. Please try again.");
          }
        };
        reader.readAsText(xhr.response as Blob);
      }
    };
    xhr.onerror = () => {
      setLoading(false);
      setProgress(null);
      setError("Could not reach the server. Check your connection and try again.");
    };
    xhr.send(form);
  }

  async function startColorizeJob() {
    if (!file) return;
    stopPolling();
    jobCancelled.current = false;
    setError("");
    setOfferBrowser(false);
    setBrowserProgress("");
    setSuggestEnhance(false);
    setAfterUrl("");
    setResultMeta(null);
    setLoading(true);
    setJobStage("queued");
    const form = new FormData();
    form.append("image", file);
    form.append("mode", mode);
    form.append("style", style);
    form.append("era", era);
    form.append("intensity", String(intensity));
    form.append("outputFormat", outputFormat);
    form.append("outputQuality", String(outputQuality));
    form.append("scale", String(scale));
    form.append("faceEnhance", faceEnhance ? "true" : "false");
    if (token) form.append("turnstileToken", token);
    try {
      const res = await fetch("/api/photo/colorize", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as { jobId?: string; error?: string; suggestMode?: string } | null;
      if (!res.ok || !data?.jobId) {
        setLoading(false);
        setJobStage(null);
        setError(data?.error ?? "Could not start that job. Please try again.");
        if (data?.suggestMode === "enhance") setSuggestEnhance(true);
        // Premium-fallback order is C -> B -> A: when the server tiers
        // fail, offer the free browser path for plain colorize.
        if (mode === "colorize" && browserSupported) setOfferBrowser(true);
        return;
      }
      window.localStorage.setItem("photo-job-id", data.jobId);
      const url = new URL(window.location.href);
      url.searchParams.set("job", data.jobId);
      window.history.replaceState(null, "", url.toString());
      setJob({ jobId: data.jobId, status: "QUEUED", stage: "queued", mode, credits: cost });
      pollJob(data.jobId);
    } catch {
      setLoading(false);
      setJobStage(null);
      setError("Could not reach the server. Check your connection and try again.");
    }
  }

  function cancelJob() {
    if (!job) return;
    jobCancelled.current = true;
    stopPolling();
    fetch(`/api/photo/jobs/${job.jobId}`, { method: "DELETE" }).catch(() => null);
    window.localStorage.removeItem("photo-job-id");
    setJob(null);
    setJobStage(null);
    setLoading(false);
    setError("Job cancelled. Your original is unchanged.");
  }

  /**
   * Tier A: colorize entirely in the browser (DeOldify ONNX, WebGPU
   * or WASM, Web Worker). Free and unlimited, no credits, and the
   * photo never leaves the device. Style/era do not apply here — the
   * model takes no style input — but intensity does (LAB-merge
   * scaling). On any engine failure the user is offered server
   * colorize instead; nothing is faked.
   */
  async function startBrowserColorize() {
    if (!file) return;
    stopPolling();
    jobCancelled.current = false;
    setError("");
    setOfferBrowser(false);
    setSuggestEnhance(false);
    setAfterUrl("");
    setResultMeta(null);
    setJob(null);
    setJobStage(null);
    setLoading(true);
    setBrowserProgress("Starting browser colorize…");
    try {
      const result = await colorizeInBrowser(file, {
        intensityPct: intensity,
        onProgress: (p: BrowserColorizeProgress) => {
          if (p.stage === "downloading-model") setBrowserProgress(formatModelProgress(p));
          else if (p.stage === "colorizing") setBrowserProgress("Colorizing in your browser… (this usually takes a few seconds)");
          else setBrowserProgress("Finishing…");
        },
      });
      setAfterUrl(URL.createObjectURL(result.blob));
      setAfterName("colorized.png");
      setOutSize(`${result.width} × ${result.height}px`);
      setQuality("ai");
      setResultMeta({
        quality: "ai",
        note: "Colorized on your device — your photo never left this device. Output is capped at 2048px on this path.",
        browser: true,
      });
      setLoading(false);
      setBrowserProgress("");
    } catch {
      setLoading(false);
      setBrowserProgress("");
      setError("Browser colorize failed on this device (the model may not have downloaded, or this browser may not support it). Try server colorize instead.");
    }
  }

  function run() {
    if (mode === "enhance") startEnhance();
    else startColorizeJob();
  }

  function downloadResult() {
    if (!afterUrl) return;
    trackEvent("photo_download");
    const a = document.createElement("a");
    a.href = afterUrl;
    a.download = afterName;
    a.click();
  }

  async function downloadJpg() {
    if (!afterUrl) return;
    setError("");
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image load failed"));
        img.src = afterUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("JPG conversion failed");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = afterName.replace(/\.(png|webp)$/, ".jpg");
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the JPG. Try the main download instead.");
    }
  }

  const isColorizeMode = mode !== "enhance";
  const isColorizeResult = resultMeta !== null && mode !== "enhance";
  const qualityLabel =
    quality === "ai"
      ? "Quality: AI Enhanced"
      : quality === "standard"
        ? "Quality: Standard"
        : "";
  const showGrayscaleWarn = isColorizeMode && mode === "colorize" && grayKind === "color";
  const showGrayscaleSuggest = mode === "enhance" && grayKind === "grayscale";
  const restoreNote =
    mode === "restore" && grayKind === "grayscale"
      ? "This looks black & white, so Restore will repair it, then colorize it."
      : mode === "restore" && grayKind === "color"
        ? "This looks like a colour photo, so Restore will repair and upscale it without colorizing."
        : null;
  const runDisabled =
    !file ||
    loading ||
    (isColorizeMode && !colorizeAvailable) ||
    showGrayscaleWarn;

  const creditLine = caps
    ? caps.signedIn && caps.remainingCredits !== null
      ? `This will use ${cost} credit${cost === 1 ? "" : "s"}. You have ${caps.remainingCredits} of ${caps.creditBudget} left today.`
      : `This will use ${cost} credit${cost === 1 ? "" : "s"}. Free: ${caps.photoCreditsFree} photo credits per day.`
    : `This will use ${cost} credit${cost === 1 ? "" : "s"}.`;

  return (
    <div className="mt-8">
      <div className="border-2 border-line bg-white p-6 dark:bg-slate-900">
        <fieldset>
          <legend className="font-semibold">What do you want to do?</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Photo mode">
            {MODE_CARDS.map((c) => (
              <label
                key={c.value}
                className={`flex cursor-pointer flex-col gap-1 border-2 p-4 ${mode === c.value ? "border-brand bg-cream dark:bg-slate-800" : "border-line"}`}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <input
                    type="radio"
                    name="photo-mode"
                    value={c.value}
                    checked={mode === c.value}
                    onChange={() => {
                      setMode(c.value);
                      trackEvent("photo_mode");
                      setError("");
                      setSuggestEnhance(false);
                      setAfterUrl("");
                      setResultMeta(null);
                      setJob(null);
                      setJobStage(null);
                    }}
                    className="h-5 w-5"
                  />
                  {c.title}
                </span>
                <span className="text-sm text-muted-fg dark:text-slate-400">{c.desc}</span>
                <span className="text-sm font-medium">
                  {caps?.photoCreditCost?.[c.value] ?? (c.value === "enhance" ? 1 : c.value === "colorize" ? 2 : 3)} credit{(caps?.photoCreditCost?.[c.value] ?? 1) === 1 ? "" : "s"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {isColorizeMode && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-line bg-white px-3 text-sm font-medium hover:border-brand dark:bg-slate-900"
            >
              {showAdvanced ? "Hide advanced options" : "Show advanced options"} (colour style, era, size, format)
            </button>
            {showAdvanced && (
              <div className="mt-3 grid gap-4 border-2 border-line p-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="color-style" className="font-medium">Colour style</label>
                  <select id="color-style" value={style} onChange={(e) => setStyle(e.target.value)} className="mt-1 min-h-[44px] w-full border-2 border-line bg-white px-2 dark:bg-slate-900">
                    {COLOR_STYLES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label} — {s.hint}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="color-era" className="font-medium">Era hint (optional)</label>
                  <select id="color-era" value={era} onChange={(e) => setEra(e.target.value)} className="mt-1 min-h-[44px] w-full border-2 border-line bg-white px-2 dark:bg-slate-900">
                    {COLOR_ERAS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="color-intensity" className="font-medium">Colour intensity: {intensity}%</label>
                  <input id="color-intensity" type="range" min={0} max={100} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="mt-1 w-full accent-pink-500" />
                  <p className="text-sm text-muted-fg dark:text-slate-400">0% keeps the photo black & white; 100% uses the model&apos;s full colours. Default 70%.</p>
                </div>
                <div>
                  <label htmlFor="output-format" className="font-medium">Download format</label>
                  <select id="output-format" value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} className="mt-1 min-h-[44px] w-full border-2 border-line bg-white px-2 dark:bg-slate-900">
                    <option value="jpg">JPG (smallest, best for sharing)</option>
                    <option value="png">PNG (largest, best quality)</option>
                    <option value="webp">WebP (small, modern browsers)</option>
                  </select>
                  {outputFormat !== "png" && (
                    <div className="mt-2">
                      <label htmlFor="output-quality" className="font-medium">Quality: {outputQuality}%</label>
                      <input id="output-quality" type="range" min={10} max={100} value={outputQuality} onChange={(e) => setOutputQuality(Number(e.target.value))} className="mt-1 w-full accent-pink-500" />
                    </div>
                  )}
                </div>
                <div>
                  <fieldset>
                    <legend className="font-medium">Upscale size</legend>
                    <label className="mt-1 flex min-h-[44px] items-center gap-2">
                      <input type="radio" name="upscale-scale" value={2} checked={scale === 2} onChange={() => setScale(2)} className="h-5 w-5" /> 2x (everyone, up to 2048px)
                    </label>
                    <label className="flex min-h-[44px] items-center gap-2">
                      <input type="radio" name="upscale-scale" value={4} checked={scale === 4} disabled={!isPremium} onChange={() => setScale(4)} className="h-5 w-5" /> 4x (Premium only, up to 4096px)
                    </label>
                  </fieldset>
                </div>
                <div>
                  <label className="flex min-h-[44px] items-center gap-2">
                    <input type="checkbox" checked={faceEnhance} disabled={!isPremium} onChange={(e) => setFaceEnhance(e.target.checked)} className="h-5 w-5" />
                    <span>Face enhance {!isPremium && "(Premium only)"}</span>
                  </label>
                  <p className="text-sm text-muted-fg dark:text-slate-400">Sharpens faces during upscaling. Only used on Colorize and Restore + Colorize.</p>
                </div>
              </div>
            )}
            <p className="mt-2 text-sm text-muted-fg dark:text-slate-400">
              Colour hints (telling the model exact colours, e.g. “blue uniform”) are not available yet: no
              verified instruction-based image model is configured. The pipeline stays faithful to the
              model&apos;s estimate instead of inventing details.
              Browser colorize uses the model&apos;s natural colours — colour style and era apply to server colorize only.
            </p>
          </div>
        )}

        <div
          role="button"
          tabIndex={0}
          aria-label="Drop an image here or choose a file"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0]); }}
          className={`mt-5 flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-[3px] border-2 border-dashed p-6 text-center ${dragOver ? "border-brand bg-cream dark:bg-slate-800" : "border-line"}`}
        >
          <Upload size={28} className="text-brand" aria-hidden="true" />
          <p className="font-semibold">{file ? file.name : "Drop your photo here, or choose a file"}</p>
          <p className="text-sm text-muted-fg dark:text-slate-400">JPG, PNG or WebP, up to 10 MB. Files are deleted after processing.</p>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Choose an image file" onChange={(e) => pick(e.target.files?.[0])} />
        </div>

        {grayChecking && <p role="status" className="mt-3 text-sm text-muted-fg dark:text-slate-400">Checking whether this photo is black & white…</p>}
        {showGrayscaleWarn && (
          <div className="mt-3"><Alert kind="error">This looks like a colour photo already, so there is nothing to colorize. Choose “Enhance only” instead.</Alert>
            <Button type="button" variant="secondary" className="mt-2" onClick={() => setMode("enhance")}>Switch to Enhance only</Button>
          </div>
        )}
        {showGrayscaleSuggest && (
          <div className="mt-3"><Alert kind="info">This looks black & white — Colorize would add estimated colours, or Restore would clean it up too.</Alert>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setMode("colorize")}>Try Colorize</Button>
              <Button type="button" variant="outline" onClick={() => setMode("restore")}>Try Restore</Button>
            </div>
          </div>
        )}
        {restoreNote && <div className="mt-3"><Alert kind="info">{restoreNote}</Alert></div>}
        {isColorizeMode && !colorizeAvailable && (
          <div className="mt-3"><Alert kind="error">{colorizeBlockedReason ?? "Colorize is unavailable right now."} Enhance only still works.</Alert></div>
        )}

        <div className="mt-4"><TurnstileWidget onToken={setToken} /></div>
        {error && (
          <div className="mt-4"><Alert kind="error">{error}</Alert>
            {suggestEnhance && <Button type="button" variant="secondary" className="mt-2" onClick={() => setMode("enhance")}>Switch to Enhance only</Button>}
            {offerBrowser && (
              <Button type="button" variant="secondary" className="mt-2" onClick={startBrowserColorize}>Try free browser colorize instead (no credits, photo stays on this device)</Button>
            )}
          </div>
        )}
        {loading && !jobStage && browserProgress && (
          <div className="mt-4" role="status" aria-live="polite">
            <p className="font-semibold">Colorizing in your browser…</p>
            <p className="text-sm text-muted-fg dark:text-slate-400">{browserProgress}</p>
            <p className="text-sm text-muted-fg dark:text-slate-400">Keep this tab open — browser colorize runs on this device, not on a server.</p>
          </div>
        )}
        {loading && jobStage && (
          <div className="mt-4" role="status" aria-live="polite">
            <p className="font-semibold">{STAGE_LABELS[jobStage] ?? jobStage}</p>
            <p className="text-sm text-muted-fg dark:text-slate-400">
              {jobStage === "queued" && "Your job is queued. You can leave this page — the job link is saved and you can come back to it."}
              {jobStage === "restoring" && "Repairing faces and scratches. This usually takes under a minute."}
              {jobStage === "colorizing" && "The AI model is estimating colours. This usually takes under a minute. If the image service is waking up, it can take a few minutes — you can leave this page and come back with the saved job link."}
              {jobStage === "upscaling" && "Upscaling the photo for a sharper result."}
              {jobStage === "finalising" && "Preparing your download…"}
            </p>
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="outline" onClick={cancelJob}>Cancel job</Button>
            </div>
          </div>
        )}
        {loading && !jobStage && progress !== null && (
          <div className="mt-4" role="status" aria-label={progress < 100 ? `Upload progress ${progress} percent` : "Processing photo"}>
            <style>{`@keyframes enhancer-indeterminate { 0% { transform: translateX(-100%);} 100% { transform: translateX(300%);} }`}</style>
            <div className="h-3 w-full overflow-hidden rounded-[3px] bg-cream dark:bg-slate-800">
              {progress < 100 ? (
                <div className="h-3 rounded-[3px] bg-brand transition-all" style={{ width: `${progress}%` }} />
              ) : (
                <div className="h-3 w-1/3 rounded-[3px] bg-brand" style={{ animation: "enhancer-indeterminate 1.2s ease-in-out infinite" }} />
              )}
            </div>
            <p className="mt-1 text-sm text-muted-fg dark:text-slate-400">
              {progress < 100 ? `Uploading… ${progress}%` : "Processing your photo… this can take a few seconds."}
            </p>
          </div>
        )}
        <p className="mt-4 text-sm text-muted-fg dark:text-slate-400" role="status">{creditLine}</p>
        {mode === "colorize" && browserSupported && !showGrayscaleWarn ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {!isPremium ? (
              <>
                <Button type="button" onClick={startBrowserColorize} disabled={!file || loading}>
                  {loading && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
                  {loading ? "Working…" : "Colorize in browser — free"}
                </Button>
                <Button type="button" variant="outline" onClick={startColorizeJob} disabled={runDisabled}>
                  Use server colorize ({cost} credits)
                </Button>
                <span className="text-sm text-muted-fg dark:text-slate-400">Browser colorize is unlimited and your photo never leaves this device. Server colorize uses a stronger model and costs credits.</span>
              </>
            ) : (
              <>
                <Button type="button" onClick={run} disabled={runDisabled}>
                  {loading && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
                  {loading ? "Working…" : "Colorize photo"}
                </Button>
                <Button type="button" variant="outline" onClick={startBrowserColorize} disabled={!file || loading}>
                  Or colorize free in your browser
                </Button>
              </>
            )}
          </div>
        ) : (
          <Button type="button" onClick={run} disabled={runDisabled} className="mt-3 w-full sm:w-auto">
            {loading && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
            {loading ? (isColorizeMode ? "Working…" : "Enhancing…") : mode === "enhance" ? "Enhance photo" : mode === "colorize" ? "Colorize photo" : "Restore photo"}
          </Button>
        )}
        {qualityLabel && !isColorizeResult && (
          <div className="mt-4"><Alert kind={quality === "ai" ? "success" : "info"}>{qualityLabel}{outSize ? ` — Done. Output ${outSize}.` : "."}</Alert></div>
        )}
        {isColorizeResult && (
          <div className="mt-4 space-y-2">
            <Alert kind="success">AI colorized: colours are estimated{outSize ? ` — Done. Output ${outSize}.` : "."}</Alert>
            {qualityLabel && <p className="text-sm font-semibold">{qualityLabel}</p>}
            <details className="border-2 border-line p-3 text-sm">
              <summary className="cursor-pointer font-semibold">Details: how this result was made</summary>
              {resultMeta?.deliveredAs && <p className="mt-2">{resultMeta.deliveredAs}</p>}
              {resultMeta?.note && <p>{resultMeta.note}</p>}
              <p>Colours are estimated by the AI model — they are not the original colours. The sharpness and detail come from your original photo.</p>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => { setAfterUrl(""); setResultMeta(null); setJob(null); setJobStage(null); }}>Try a different colour style</Button>
            </div>
            <p className="text-sm text-muted-fg dark:text-slate-400">
              {resultMeta?.browser
                ? "Change the intensity above and run again — no need to re-upload while this file is here. Browser colorize uses natural colours (style and era apply to server colorize only)."
                : "Change the style, era or intensity above and run again — no need to re-upload while this file is here."}
            </p>
          </div>
        )}
      </div>

      {beforeUrl && (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <figure className="border-2 border-line bg-white p-4 dark:bg-slate-900">
            <figcaption className="mb-2 font-semibold">Before</figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={beforeUrl} alt="Original photo before processing" className="max-h-[420px] w-full object-contain bg-cream dark:bg-slate-800" />
          </figure>
          <figure className="border-2 border-line bg-white p-4 dark:bg-slate-900">
            <figcaption className="mb-2 font-semibold">After{quality ? ` — Quality: ${quality === "ai" ? "AI Enhanced" : "Standard"}` : ""}</figcaption>
            {afterUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={afterUrl} alt="Photo after processing" className="max-h-[420px] w-full object-contain bg-cream dark:bg-slate-800" />
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button type="button" variant="secondary" onClick={downloadResult}>
                    <Download size={18} aria-hidden="true" /> Download result
                  </Button>
                  <Button type="button" variant="outline" onClick={downloadJpg}>
                    <Download size={18} aria-hidden="true" /> Download JPG
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex min-h-[200px] items-center justify-center text-muted-fg dark:text-slate-400">
                {loading ? "Processing…" : "Your processed photo will appear here."}
              </div>
            )}
          </figure>
        </div>
      )}

      {beforeUrl && afterUrl && (
        <div className="mt-6 border-2 border-line bg-white p-6 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label htmlFor="compare-slider" className="font-semibold">Compare: drag to reveal before and after</label>
            <div className="flex gap-2">
              <Button type="button" variant={compareMode === "slider" ? "secondary" : "outline"} onClick={() => setCompareMode("slider")}>Slider</Button>
              <Button type="button" variant={compareMode === "side" ? "secondary" : "outline"} onClick={() => setCompareMode("side")}>Side by side</Button>
            </div>
          </div>
          {compareMode === "slider" ? (
            <>
              <div className="relative mt-3 overflow-auto border-2 border-line" style={{ maxHeight: 420 }}>
                <div className="relative" style={{ width: `${zoom}%`, minWidth: "100%" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={afterUrl} alt="Processed photo" className="block max-h-[420px] w-full object-contain" />
                  <div className="absolute inset-0 overflow-hidden" style={{ width: `${slider}%` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={beforeUrl} alt="" aria-hidden="true" className="block h-full max-h-[420px] w-full object-cover object-left" style={{ width: `${100 / Math.max(slider, 1) * 100}%`, maxWidth: "none" }} />
                  </div>
                  <div className="absolute inset-y-0 w-[3px] bg-brand" style={{ left: `${slider}%` }} aria-hidden="true" />
                </div>
              </div>
              <input
                id="compare-slider" type="range" min={0} max={100} value={slider}
                onChange={(e) => setSlider(Number(e.target.value))}
                className="mt-3 w-full accent-pink-500" aria-label="Comparison slider: left shows before, right shows after"
              />
              <p className="text-sm text-muted-fg dark:text-slate-400">Left side shows the original, right side shows the processed version.</p>
              <div className="mt-3">
                <label htmlFor="compare-zoom" className="font-medium">Zoom: {zoom}%</label>
                <input id="compare-zoom" type="range" min={100} max={200} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="mt-1 w-full accent-pink-500" aria-label="Zoom the comparison image" />
              </div>
            </>
          ) : (
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <figure>
                <figcaption className="mb-2 font-semibold">Before</figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={beforeUrl} alt="Original photo" className="max-h-[420px] w-full object-contain bg-cream dark:bg-slate-800" />
              </figure>
              <figure>
                <figcaption className="mb-2 font-semibold">After</figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={afterUrl} alt="Processed photo" className="max-h-[420px] w-full object-contain bg-cream dark:bg-slate-800" />
              </figure>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
