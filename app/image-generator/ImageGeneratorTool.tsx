"use client";

// Minimal text-to-image tool: prompt box, size choice, generate,
// result image with a download button. The API route enforces
// sign-in + daily budget; this component only renders what the
// route returns. Provider and model names are never shown here —
// the route never sends them (P0: no provider names in responses).

import { useState } from "react";
import Link from "next/link";
import { TurnstileWidget } from "@/components/site/TurnstileWidget";

type Size = "square" | "portrait" | "landscape" | "wide";

const SIZES: Array<{ value: Size; label: string }> = [
  { value: "square", label: "Square (1:1)" },
  { value: "portrait", label: "Portrait (3:4)" },
  { value: "landscape", label: "Landscape (4:3)" },
  { value: "wide", label: "Wide (16:9)" },
];

export function ImageGeneratorTool({ signedIn }: { signedIn?: boolean }) {
  const guest = signedIn === false;
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<Size>("square");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [image, setImage] = useState("");
  const [mime, setMime] = useState("image/jpeg");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [budget, setBudget] = useState<number | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNeedsSignIn(false);
    if (prompt.trim().length < 3) {
      setError("Please describe your image in at least 3 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), size, turnstileToken: token || undefined }),
      });
      const data = (await res.json().catch(() => null)) as {
        image?: string;
        mime?: string;
        remaining?: number;
        budget?: number;
        error?: string;
      } | null;
      if (res.status === 401) {
        setNeedsSignIn(true);
        setError(data?.error ?? "Please sign in to generate images.");
        return;
      }
      if (!res.ok || !data?.image) {
        setError(data?.error ?? "The image could not be generated. Please try again.");
        return;
      }
      setImage(data.image);
      setMime(data.mime ?? "image/jpeg");
      setRemaining(typeof data.remaining === "number" ? data.remaining : null);
      setBudget(typeof data.budget === "number" ? data.budget : null);
    } catch {
      setError("The image could not be generated. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <form onSubmit={generate} className="h-fit border-2 border-line bg-white p-6 dark:bg-slate-900" aria-label="Image generator">
        <label className="block font-semibold" htmlFor="image-prompt">
          Describe your image
        </label>
        <textarea
          id="image-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={500}
          rows={4}
          placeholder="A quiet mountain lake at sunrise, mist over the water, photorealistic"
          className="mt-2 w-full border-2 border-line bg-white p-3 dark:bg-slate-900"
        />
        <p className="mt-1 text-sm text-muted-fg dark:text-slate-400">{prompt.length}/500 characters.</p>
        <label className="mt-4 block font-semibold" htmlFor="image-size">
          Size
        </label>
        <select
          id="image-size"
          value={size}
          onChange={(e) => setSize(e.target.value as Size)}
          className="mt-2 w-full border-2 border-line bg-white p-3 dark:bg-slate-900"
        >
          {SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="mt-4">
          <TurnstileWidget onToken={setToken} />
        </div>
        <button
          type="submit"
          disabled={busy || guest}
          className="mt-4 inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand-dark bg-brand-dark px-5 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Generating…" : guest ? "Sign in to generate images" : "Generate image (1 credit)"}
        </button>
        {guest && (
          <p className="mt-3 text-sm text-muted-fg dark:text-slate-400">
            Image generation needs an account to count your daily budget.{" "}
            <Link href="/signin" className="font-semibold underline">
              Sign in
            </Link>{" "}
            to generate — guests can still use the logo maker and photo enhancer without signing in.
          </p>
        )}
        {remaining !== null && budget !== null && (
          <p className="mt-3 text-sm text-muted-fg dark:text-slate-400">
            {remaining} of {budget} images left today.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 border-2 border-red-500 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}{" "}
            {needsSignIn && (
              <Link href="/signin" className="font-semibold underline">
                Sign in
              </Link>
            )}
          </p>
        )}
      </form>
      <div className="border-2 border-line bg-white p-6 dark:bg-slate-900" aria-label="Generated image">
        {image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="Generated from your description" className="w-full" />
            <a
              href={image}
              download={`generated-image.${ext}`}
              className="mt-4 inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-line bg-white px-5 py-2.5 font-semibold hover:border-brand dark:bg-slate-900"
            >
              Download image
            </a>
          </>
        ) : (
          <p className="text-muted-fg dark:text-slate-400">
            Your generated image will appear here. Describe it on the left, pick a size, and generate.
          </p>
        )}
      </div>
    </div>
  );
}
