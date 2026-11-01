import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Logo for a Fitness Studio",
  description: "Design a fitness studio logo in seconds: bold shapes, high-contrast colours, and a mark that works on shirts and signs. Free, original SVG logos from AI Studio.",
  openGraph: {
    title: "Logo for a Fitness Studio | AI Studio",
    description: "Bold shapes, high-contrast colours, and a mark that works on shirts and signs — generate your fitness logo free.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Logo for a Fitness Studio",
  description: "How to design a fitness studio logo with AI Studio, and what makes one work.",
};

export default function FitnessStudioPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="font-display text-4xl font-bold italic">Logo for a fitness studio</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-fg dark:text-slate-300">
        A fitness logo lives on T-shirts, water bottles, and gym walls. It needs energy at a glance:
        bold shapes, strong contrast, and a name that reads from the back of the room.
      </p>
      <h2 className="mt-8 text-2xl font-bold">What works</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-fg dark:text-slate-300">
        <li>Bold, simple motion: a pulse line, a leap, a weight plate — one idea, drawn thick.</li>
        <li>High contrast: red or orange on black, or black on white, so it prints on any shirt colour.</li>
        <li>Flat or badge style; avoid thin lines that vanish on fabric.</li>
        <li>Short names work best. If your name is long, use initials in the mark and the full name below.</li>
      </ul>
      <h2 className="mt-8 text-2xl font-bold">Try these prompts</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>“bold fitness studio logo with a pulse line” — flat style, red and black.</li>
        <li>“minimal gym badge with a dumbbell mark” — badge style, one colour.</li>
        <li>“energetic running-studio logo, single swoosh mark” — minimal style, orange and slate.</li>
      </ul>
      <Link href="/logo-generator" className="mt-8 inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand-dark bg-brand-dark px-5 py-2.5 font-semibold text-white">
        Generate my fitness logo — free
      </Link>
      <p className="mt-4 text-sm text-muted-fg dark:text-slate-400">
        Free tier: 10 requests per day, 3 variants per request. Prompts referencing existing brands are refused.
      </p>
    </div>
  );
}
