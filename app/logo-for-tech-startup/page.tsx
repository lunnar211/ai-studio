import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Logo for a Tech Startup",
  description: "Design a tech startup logo in seconds: geometric shapes, two colours, and a mark that reads as an app icon. Free, original SVG logos from AI Studio.",
  openGraph: {
    title: "Logo for a Tech Startup | AI Studio",
    description: "Geometric shapes, two colours, and a mark that reads as an app icon — generate your startup logo free.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Logo for a Tech Startup",
  description: "How to design a tech startup logo with AI Studio, and what makes one work.",
};

export default function TechStartupPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="font-display text-4xl font-bold italic">Logo for a tech startup</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-fg dark:text-slate-300">
        A startup logo has to survive as a 32-pixel app icon, a pitch-deck header, and a website
        favicon. That means geometry, not detail.
      </p>
      <h2 className="mt-8 text-2xl font-bold">What works</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-fg dark:text-slate-300">
        <li>Geometric or minimal style: circles, triangles, and rounded rectangles.</li>
        <li>Two colours at most — one bold, one neutral — so it works on light and dark backgrounds.</li>
        <li>A mark that still reads when shrunk to an app icon; test it in the mockup preview.</li>
        <li>No tagline inside the logo. Keep the name; add the tagline in your marketing, not the mark.</li>
      </ul>
      <h2 className="mt-8 text-2xl font-bold">Try these prompts</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>“minimal geometric tech startup logo” — flat shapes, pink and cyan.</li>
        <li>“abstract monogram from the letters N and X” — monogram style, one colour.</li>
        <li>“simple data-flow mark for a software company” — geometric style, blue and slate.</li>
      </ul>
      <Link href="/logo-generator" className="mt-8 inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand bg-brand px-5 py-2.5 font-semibold text-white">
        Generate my startup logo — free
      </Link>
      <p className="mt-4 text-sm text-muted-fg dark:text-slate-400">
        Free tier: 10 requests per day, 3 variants per request. Prompts referencing existing brands are refused.
      </p>
    </div>
  );
}
