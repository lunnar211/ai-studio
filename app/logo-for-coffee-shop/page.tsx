import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Logo for a Coffee Shop",
  description: "Design a coffee shop logo in seconds: warm colours, a simple cup or bean mark, and a readable name. Free, original SVG logos from AI Studio.",
  openGraph: {
    title: "Logo for a Coffee Shop | AI Studio",
    description: "Warm colours, a simple cup or bean mark, and a readable name — generate your coffee shop logo free.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Logo for a Coffee Shop",
  description: "How to design a coffee shop logo with AI Studio, and what makes one work.",
};

export default function CoffeeShopPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="font-display text-4xl font-bold italic">Logo for a coffee shop</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-fg dark:text-slate-300">
        A coffee shop logo has one job: make someone walking past want to come in. Warm colours, one
        simple mark, and a name you can read from across the street.
      </p>
      <h2 className="mt-8 text-2xl font-bold">What works</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-fg dark:text-slate-300">
        <li>One mark: a cup, a bean, a mountain, or steam — never all four at once.</li>
        <li>Warm colours: browns, creams, and one accent (amber or deep green).</li>
        <li>Badge style suits cups, bags, and shop signs; flat style suits apps and menus.</li>
        <li>Your name in bold, below the mark, readable at small sizes.</li>
      </ul>
      <h2 className="mt-8 text-2xl font-bold">Try these prompts</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>“mountain coffee roaster” — a peak with a bean, badge style.</li>
        <li>“warm bakery-style coffee shop with a steaming cup” — flat style, brown and cream.</li>
        <li>“minimal neighbourhood café, single-line cup mark” — minimal style, one colour.</li>
      </ul>
      <Link href="/logo-generator" className="mt-8 inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand-dark bg-brand-dark px-5 py-2.5 font-semibold text-white">
        Generate my coffee shop logo — free
      </Link>
      <p className="mt-4 text-sm text-muted-fg dark:text-slate-400">
        Free tier: unlimited requests, 3 variants per request. Prompts referencing existing brands are refused.
      </p>
    </div>
  );
}
