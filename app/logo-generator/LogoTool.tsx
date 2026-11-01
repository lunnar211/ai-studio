"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Copy, Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Label, TextInput, TextArea, Select } from "@/components/ui/field";
import { TurnstileWidget } from "@/components/site/TurnstileWidget";
import LogoGallery from "@/components/LogoGallery";

// Mockup preview is client-only and below the fold: lazy-load it so the
// generator page's first paint stays light.
const MockupPreview = dynamic(() => import("@/components/MockupPreview"), {
  ssr: false,
  loading: () => <p className="mt-6 text-sm text-gray-500">Loading mockup preview…</p>,
});

const STYLES = [
  { value: "flat", label: "Flat" },
  { value: "minimal", label: "Minimal" },
  { value: "geometric", label: "Geometric" },
  { value: "badge", label: "Badge" },
  { value: "monogram", label: "Monogram" },
];

const SUGGESTED = [
  "mountain coffee roaster",
  "minimal tech startup",
  "bold fitness studio",
  "warm bakery with wheat",
  "friendly pet care",
];

const STAGES = [
  "Designing your symbol…",
  "Adding your brand name…",
  "Polishing 3 variants…",
];

type Limits = { signedIn: boolean; limit: number; remaining: number | null };

async function svgToPngBlob(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(img, 0, 0, 1024, 1024);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG conversion failed");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function LogoTool() {
  const [prompt, setPrompt] = useState("");
  const [brandName, setBrandName] = useState("");
  const [style, setStyle] = useState("flat");
  const [colors, setColors] = useState("pink and cyan");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [variants, setVariants] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState<number | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [regenIndex, setRegenIndex] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const micSupported = typeof window !== "undefined" && typeof navigator !== "undefined" && "mediaDevices" in navigator && typeof window.MediaRecorder !== "undefined";

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        setTranscribing(true);
        setError("");
        try {
          const form = new FormData();
          form.append("audio", blob, "memo.webm");
          if (token) form.append("turnstileToken", token);
          const res = await fetch("/api/logo/transcribe", { method: "POST", body: form });
          const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
          if (!res.ok || !data?.text) {
            setError(data?.error ?? "Could not transcribe that recording. Please type your prompt.");
          } else {
            setPrompt((p) => (p ? `${p} ${data.text}` : data.text ?? ""));
          }
        } catch {
          setError("Could not transcribe that recording. Please type your prompt.");
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone access was denied. Please type your prompt instead.");
    }
  }
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshLimits = useCallback(async () => {
    try {
      const res = await fetch("/api/logo/limits");
      if (res.ok) setLimits((await res.json()) as Limits);
    } catch {
      // Counter is a nicety; generation still works without it.
    }
  }, []);

  useEffect(() => {
    void refreshLimits();
    return () => {
      if (stageTimer.current) clearInterval(stageTimer.current);
    };
  }, [refreshLimits]);

  function startStages() {
    setStage(0);
    if (stageTimer.current) clearInterval(stageTimer.current);
    stageTimer.current = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 3500);
  }
  function stopStages() {
    if (stageTimer.current) clearInterval(stageTimer.current);
  }

  async function runGeneration(): Promise<string[] | null> {
    const res = await fetch("/api/logo/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, style, colors, brandName: brandName || undefined, turnstileToken: token || undefined }),
    });
    const data = (await res.json().catch(() => ({}))) as { variants?: string[]; svg?: string; error?: string; remaining?: number; limit?: number };
    if (typeof data.remaining === "number" && typeof data.limit === "number") {
      setLimits((prev) => ({ signedIn: prev?.signedIn ?? false, limit: data.limit as number, remaining: data.remaining as number }));
    } else {
      void refreshLimits();
    }
    if (!res.ok) {
      setError(data.error || "Something went wrong. Please try again.");
      return null;
    }
    const list = data.variants?.length ? data.variants : data.svg ? [data.svg] : [];
    if (!list.length) {
      setError("The response was not a usable logo. Please try again.");
      return null;
    }
    return list;
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    startStages();
    try {
      const list = await runGeneration();
      if (list) {
        setVariants(list);
        setSelected(0);
        setNotice("One request = 3 variants = 1 credit of your daily limit.");
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
      stopStages();
    }
  }

  async function regenerateVariant(index: number) {
    setError("");
    setRegenIndex(index);
    try {
      const list = await runGeneration();
      if (list) {
        setVariants((prev) => {
          const next = [...prev];
          next[index] = list[0];
          return next;
        });
        setSelected(index);
        setNotice("Variant regenerated. Each regeneration uses 1 credit.");
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setRegenIndex(null);
    }
  }

  function downloadSvg(svg: string, index: number) {
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `logo-${index + 1}.svg`);
  }

  async function downloadPng(svg: string, index: number) {
    setError("");
    try {
      const blob = await svgToPngBlob(svg);
      downloadBlob(blob, `logo-${index + 1}.png`);
    } catch {
      // Server-side fallback (Sharp) when the browser conversion fails.
      try {
        const res = await fetch("/api/logo/png", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ svg }),
        });
        if (!res.ok) throw new Error("server conversion failed");
        downloadBlob(await res.blob(), `logo-${index + 1}.png`);
      } catch {
        setError("Could not download the PNG. Try the SVG download instead.");
      }
    }
  }

  async function copySvg(svg: string, index: number) {
    try {
      await navigator.clipboard.writeText(svg);
      setCopied(index);
      setTimeout(() => setCopied((c) => (c === index ? null : c)), 2000);
    } catch {
      setError("Could not copy to the clipboard. Use Download SVG instead.");
    }
  }

  const atLimit = limits?.remaining === 0;
  const counterText = limits
    ? limits.remaining !== null
      ? `${limits.remaining} of ${limits.limit} left today`
      : `Free tier: ${limits.limit} logos per day`
    : "Free tier: 10 logos per day";

  return (
    <div>
      <LogoGallery
        onPick={(p, b) => {
          setPrompt(p);
          setBrandName(b);
          document.getElementById("logo-prompt")?.focus();
        }}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={generate} className="h-fit border-2 border-line bg-white p-6 dark:bg-slate-900" aria-label="Logo generator">
          <div>
            <Label htmlFor="logo-prompt">Describe your logo</Label>
            <TextArea
              id="logo-prompt" rows={4} maxLength={300} required value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Example: a friendly mountain coffee roaster, simple peak and coffee bean mark"
            />
            <p className="mt-1 text-sm text-muted-fg dark:text-slate-400">{prompt.length}/300 characters. Brand, character and celebrity names are refused.</p>
            {micSupported && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleRecording}
                  disabled={transcribing}
                  aria-label={recording ? "Stop recording voice memo" : "Record a voice memo for your logo description"}
                  aria-pressed={recording}
                  className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-line bg-white px-3 text-sm font-medium hover:border-brand dark:bg-slate-900"
                >
                  {recording ? "⏹ Stop recording" : "🎤 Dictate prompt"}
                </button>
                <span role="status" className="text-sm text-muted-fg dark:text-slate-400">
                  {recording ? "Recording… speak now, then stop." : transcribing ? "Transcribing…" : "Voice is transcribed into text you can edit."}
                </span>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggested prompts">
            {SUGGESTED.map((s) => (
              <button
                key={s} type="button"
                onClick={() => setPrompt(s)}
                className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-medium text-pink-700 hover:bg-pink-100 focus:outline-none focus:ring-2 focus:ring-pink-500"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="logo-brand">Brand name (optional)</Label>
              <TextInput id="logo-brand" value={brandName} maxLength={40} onChange={(e) => setBrandName(e.target.value)} placeholder="Summit Roast" />
            </div>
            <div>
              <Label htmlFor="logo-style">Style</Label>
              <Select id="logo-style" value={style} onChange={(e) => setStyle(e.target.value)}>
                {STYLES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
              </Select>
            </div>
          </div>
          <div className="mt-4">
            <Label htmlFor="logo-colors">Colours</Label>
            <TextInput id="logo-colors" value={colors} maxLength={120} onChange={(e) => setColors(e.target.value)} placeholder="pink and cyan" />
          </div>
          <div className="mt-4"><TurnstileWidget onToken={setToken} /></div>
          {error && <div className="mt-4"><Alert kind="error">{error}</Alert></div>}
          {notice && <div className="mt-4"><Alert kind="success">{notice}</Alert></div>}
          <Button type="submit" disabled={loading || prompt.trim().length < 3 || atLimit} className="mt-5 w-full">
            {loading && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
            {atLimit ? "Daily limit reached — try again tomorrow" : loading ? "Generating…" : "Generate 3 logo variants"}
          </Button>
          <p className="mt-3 text-sm text-muted-fg dark:text-slate-400" aria-live="polite">
            {counterText}. One request gives 3 variants and uses 1 credit.
            {atLimit && " You have used today's free logos — sign in or upgrade for more tomorrow."}
            {" "}If AI generation is not configured, you will see an honest message instead of a fake logo.
          </p>
        </form>

        <section aria-live="polite" aria-label="Logo results" className="border-2 border-line bg-white p-6 dark:bg-slate-900">
          {loading ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
              <Loader2 size={32} className="animate-spin text-brand" aria-hidden="true" />
              <p className="font-medium">{STAGES[stage]}</p>
              <p className="text-sm text-muted-fg dark:text-slate-400">Usually about 10 seconds. No streaming preview: each logo is checked on the server before it is shown, so a broken logo never reaches you.</p>
            </div>
          ) : variants.length ? (
            <div>
              <p className="text-sm font-medium text-gray-900">Pick a variant to preview it as a mockup:</p>
              <div className="mt-3 grid grid-cols-3 gap-3" role="list">
                {variants.map((svg, i) => (
                  <div key={i} role="listitem" className={`rounded-xl border-2 p-2 ${selected === i ? "border-pink-500 bg-pink-50/50" : "border-gray-200 bg-white"}`}>
                    <button
                      type="button"
                      onClick={() => setSelected(i)}
                      className="block aspect-square w-full overflow-hidden rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 [&>svg]:h-full [&>svg]:w-full"
                      aria-label={`Select logo variant ${i + 1}`}
                      aria-pressed={selected === i}
                    >
                      <span className="block h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
                    </button>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Button type="button" variant="outline" className="flex-1 px-1 text-xs" disabled={regenIndex !== null || atLimit} onClick={() => regenerateVariant(i)} aria-label={`Regenerate variant ${i + 1}`}>
                        {regenIndex === i ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />} Regenerate
                      </Button>
                      <Button type="button" variant="outline" className="flex-1 px-1 text-xs" onClick={() => downloadSvg(svg, i)} aria-label={`Download variant ${i + 1} as SVG`}>
                        <Download size={14} aria-hidden="true" /> SVG
                      </Button>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Button type="button" variant="secondary" className="flex-1 px-1 text-xs" onClick={() => downloadPng(svg, i)} aria-label={`Download variant ${i + 1} as PNG 1024 pixels`}>
                        <Download size={14} aria-hidden="true" /> PNG 1024
                      </Button>
                      <Button type="button" variant="outline" className="flex-1 px-1 text-xs" onClick={() => copySvg(svg, i)} aria-label={`Copy variant ${i + 1} SVG code`}>
                        {copied === i ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied === i ? "Copied" : "Copy SVG"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-fg dark:text-slate-400">Regenerating one variant uses 1 credit and replaces only that variant.</p>
              {variants[selected] && <MockupPreview svg={variants[selected]} brand={brandName} />}
            </div>
          ) : (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 text-center">
              <p className="text-lg font-semibold">Your logos will appear here</p>
              <p className="max-w-sm text-muted-fg dark:text-slate-300">Describe your brand on the left, pick a style, and generate. You get 3 variants per request, each with its own download and copy buttons.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
