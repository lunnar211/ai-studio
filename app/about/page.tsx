import type { Metadata } from "next";
import { LIMITS } from "@/lib/limits";
export const metadata: Metadata = { title: "About", description: "AI Studio makes two free AI tools: an original logo generator and a photo enhancer. No account needed for the free tier." };
export default function About() {
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-4xl font-bold italic">About AI Studio</h1>
      <p className="mt-4 text-lg text-muted-fg dark:text-slate-300">
        AI Studio is a small set of free AI tools for people who need one thing done well: a logo for
        a new business, or a photo made sharper. There is no account to create for the free tier, and
        no payment details are collected.
      </p>
      <h2 className="mt-8 text-2xl font-bold">What we offer</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li><strong>AI Logo Generator:</strong> original SVG logos from a short description, downloadable as SVG or 1024px PNG.</li>
        <li><strong>AI Photo Enhancer:</strong> sharper, upscaled photos with a before/after comparison and an honest AI or standard-quality label.</li>
      </ul>
      <h2 className="mt-8 text-2xl font-bold">How we handle your files</h2>
      <p className="mt-3 text-muted-fg dark:text-slate-300">
        Files are processed on our server and deleted immediately after processing (max 60 minutes in any case).
        We never list, share, sell or train models on them. See the Privacy Policy for the full picture.
      </p>
      <h2 className="mt-8 text-2xl font-bold">Free tier and premium</h2>
      <p className="mt-3 text-muted-fg dark:text-slate-300">
        The free tier allows {LIMITS.logoRequestsFree} logo requests and {LIMITS.photoCreditsFree} photo
        credits per day per visitor. Signing in keeps the same free limits and adds saved logo history,
        favorites, and account features — it does not raise free limits. A Premium plan
        ({LIMITS.logoRequestsPremium} logo requests and {LIMITS.photoCreditsPremium} photo credits per
        day, HD 4x up to 4096px, face enhance, priority generation, no ads) is sold through Paddle
        (merchant of record) once checkout is configured — this site never asks you to type card
        details into a form here.
      </p>
    </div>
  );
}
