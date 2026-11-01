"use client";
import { useRef, useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/field";
import { TurnstileWidget } from "@/components/site/TurnstileWidget";

const MAX_BYTES = 10 * 1024 * 1024;

export function EnhancerTool() {
  const [file, setFile] = useState<File | null>(null);
  const [beforeUrl, setBeforeUrl] = useState("");
  const [afterUrl, setAfterUrl] = useState("");
  const [engine, setEngine] = useState("");
  const [outSize, setOutSize] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [slider, setSlider] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    setError("");
    setAfterUrl("");
    setEngine("");
    if (f.size > MAX_BYTES) { setError("That file is over 10 MB. Please choose a smaller image."); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      setError("Please choose a JPG, PNG or WebP image.");
      return;
    }
    setFile(f);
    setBeforeUrl(URL.createObjectURL(f));
  }

  function enhance() {
    if (!file) return;
    setError("");
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
        const eng = xhr.getResponseHeader("X-Engine") || "";
        const w = xhr.getResponseHeader("X-Output-Width") || "";
        const h = xhr.getResponseHeader("X-Output-Height") || "";
        setEngine(eng);
        setOutSize(w && h ? `${w} × ${h}px` : "");
        const blob = xhr.response as Blob;
        setAfterUrl(URL.createObjectURL(blob));
      } else {
        // Error responses are JSON blobs; read the message.
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

  function download() {
    if (!afterUrl) return;
    const a = document.createElement("a");
    a.href = afterUrl; a.download = "enhanced.png"; a.click();
  }

  // JPG download: redraw the enhanced PNG onto a white canvas (JPG has no
  // transparency, so the background must be filled) and export at quality 0.92.
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
      a.href = url; a.download = "enhanced.jpg"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the JPG. Try the PNG download instead.");
    }
  }

  const engineLabel =
    engine === "ai"
      ? "AI enhanced"
      : engine === "sharp"
        ? "Enhanced (standard quality — set REPLICATE_API_TOKEN for AI upscaling)"
        : "";

  return (
    <div className="mt-8">
      <div className="border-2 border-line bg-white p-6 dark:bg-slate-900">
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop an image here or choose a file"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0]); }}
          className={`flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-[3px] border-2 border-dashed p-6 text-center ${dragOver ? "border-brand bg-cream dark:bg-slate-800" : "border-line"}`}
        >
          <Upload size={28} className="text-brand" aria-hidden="true" />
          <p className="font-semibold">{file ? file.name : "Drop your photo here, or choose a file"}</p>
          <p className="text-sm text-muted-fg dark:text-slate-400">JPG, PNG or WebP, up to 10 MB. Files are deleted after processing.</p>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Choose an image file" onChange={(e) => pick(e.target.files?.[0])} />
        </div>
        <div className="mt-4"><TurnstileWidget onToken={setToken} /></div>
        {error && <div className="mt-4"><Alert kind="error">{error}</Alert></div>}
        {loading && progress !== null && (
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
        <Button type="button" onClick={enhance} disabled={!file || loading} className="mt-5 w-full sm:w-auto">
          {loading && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          {loading ? "Enhancing…" : "Enhance photo"}
        </Button>
        {engineLabel && (
          <div className="mt-4"><Alert kind={engine === "ai" ? "success" : "info"}>{engineLabel}{outSize ? ` — output ${outSize}.` : "."}</Alert></div>
        )}
      </div>

      {beforeUrl && (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <figure className="border-2 border-line bg-white p-4 dark:bg-slate-900">
            <figcaption className="mb-2 font-semibold">Before</figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={beforeUrl} alt="Original photo before enhancement" className="max-h-[420px] w-full object-contain bg-cream dark:bg-slate-800" />
          </figure>
          <figure className="border-2 border-line bg-white p-4 dark:bg-slate-900">
            <figcaption className="mb-2 font-semibold">After{engine ? ` — ${engine === "ai" ? "AI enhanced" : "standard quality"}` : ""}</figcaption>
            {afterUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={afterUrl} alt="Photo after enhancement" className="max-h-[420px] w-full object-contain bg-cream dark:bg-slate-800" />
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button type="button" variant="secondary" onClick={download}>
                    <Download size={18} aria-hidden="true" /> Download PNG
                  </Button>
                  <Button type="button" variant="outline" onClick={downloadJpg}>
                    <Download size={18} aria-hidden="true" /> Download JPG
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex min-h-[200px] items-center justify-center text-muted-fg dark:text-slate-400">
                {loading ? "Processing…" : "Your enhanced photo will appear here."}
              </div>
            )}
          </figure>
        </div>
      )}

      {beforeUrl && afterUrl && (
        <div className="mt-6 border-2 border-line bg-white p-6 dark:bg-slate-900">
          <label htmlFor="compare-slider" className="font-semibold">Compare: drag to reveal before and after</label>
          <div className="relative mt-3 overflow-hidden border-2 border-line" style={{ maxHeight: 420 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={afterUrl} alt="Enhanced photo" className="block max-h-[420px] w-full object-contain" />
            <div className="absolute inset-0 overflow-hidden" style={{ width: `${slider}%` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={beforeUrl} alt="" aria-hidden="true" className="block h-full max-h-[420px] w-full object-cover object-left" style={{ width: `${100 / Math.max(slider, 1) * 100}%`, maxWidth: "none" }} />
            </div>
            <div className="absolute inset-y-0 w-[3px] bg-brand" style={{ left: `${slider}%` }} aria-hidden="true" />
          </div>
          <input
            id="compare-slider" type="range" min={0} max={100} value={slider}
            onChange={(e) => setSlider(Number(e.target.value))}
            className="mt-3 w-full accent-pink-500" aria-label="Comparison slider: left shows before, right shows after"
          />
          <p className="text-sm text-muted-fg dark:text-slate-400">Left side shows the original, right side shows the enhanced version.</p>
        </div>
      )}
    </div>
  );
}
