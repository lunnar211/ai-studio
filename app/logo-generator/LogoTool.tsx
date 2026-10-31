"use client";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Label, TextInput, TextArea, Select } from "@/components/ui/field";
import { TurnstileWidget } from "@/components/site/TurnstileWidget";

const STYLES = [
  { value: "flat", label: "Flat" },
  { value: "minimal", label: "Minimal" },
  { value: "geometric", label: "Geometric" },
  { value: "badge", label: "Badge" },
  { value: "monogram", label: "Monogram" },
];

export function LogoTool() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("flat");
  const [colors, setColors] = useState("pink and cyan");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [svg, setSvg] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/logo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, style, colors, turnstileToken: token || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { svg?: string; error?: string };
      const rem = res.headers.get("X-RateLimit-Remaining");
      if (rem !== null) setRemaining(Number(rem));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      if (!data.svg) { setError("The response was not a usable logo. Please try again."); return; }
      setSvg(data.svg);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function downloadSvg() {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "logo.svg"; a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPng() {
    setError("");
    try {
      const res = await fetch("/api/logo/png", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ svg }),
      });
      if (!res.ok) { setError("Could not convert the logo to PNG."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "logo.png"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the PNG. Please try again.");
    }
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <form onSubmit={generate} className="border-2 border-line bg-white p-6 dark:bg-slate-900" aria-label="Logo generator">
        <div>
          <Label htmlFor="logo-prompt">Describe your logo</Label>
          <TextArea
            id="logo-prompt" rows={4} maxLength={300} required value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Example: a friendly mountain coffee roaster, simple peak and coffee bean mark"
          />
          <p className="mt-1 text-sm text-muted-fg dark:text-slate-400">{prompt.length}/300 characters. Brand, character and celebrity names are refused.</p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="logo-style">Style</Label>
            <Select id="logo-style" value={style} onChange={(e) => setStyle(e.target.value)}>
              {STYLES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
            </Select>
          </div>
          <div>
            <Label htmlFor="logo-colors">Colours</Label>
            <TextInput id="logo-colors" value={colors} maxLength={120} onChange={(e) => setColors(e.target.value)} placeholder="pink and cyan" />
          </div>
        </div>
        <div className="mt-4"><TurnstileWidget onToken={setToken} /></div>
        {error && <div className="mt-4"><Alert kind="error">{error}</Alert></div>}
        <Button type="submit" disabled={loading || prompt.trim().length < 3} className="mt-5 w-full">
          {loading && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          {loading ? "Generating…" : "Generate logo"}
        </Button>
        <p className="mt-3 text-sm text-muted-fg dark:text-slate-400">
          Free tier: 10 logos per day per visitor.
          {remaining !== null && ` ${remaining} left today.`}
          {" "}If AI generation is not configured, you will see an honest message instead of a fake logo.
        </p>
      </form>

      <section aria-live="polite" aria-label="Logo result" className="border-2 border-line bg-white p-6 dark:bg-slate-900">
        {loading ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-3">
            <Loader2 size={32} className="animate-spin text-brand" aria-hidden="true" />
            <p>Drawing your logo…</p>
          </div>
        ) : svg ? (
          <div>
            <div className="flex min-h-[280px] items-center justify-center border-2 border-dashed border-line bg-cream p-4 dark:bg-slate-800" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="mt-3 text-sm text-muted-fg dark:text-slate-400">Original logo, generated from your description. SVG preview above.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={downloadSvg}><Download size={18} aria-hidden="true" /> Download SVG</Button>
              <Button type="button" variant="secondary" onClick={downloadPng}><Download size={18} aria-hidden="true" /> Download PNG (1024px)</Button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-lg font-semibold">Your logo will appear here</p>
            <p className="max-w-sm text-muted-fg dark:text-slate-300">Describe your brand on the left, pick a style, and generate. The preview and download buttons appear after generation.</p>
          </div>
        )}
      </section>
    </div>
  );
}
