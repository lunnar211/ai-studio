import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, Wand2, ShieldCheck, Zap, Download } from "lucide-react";
import { LIMITS } from "@/lib/limits";
import { RestoreSection } from "@/components/site/RestoreSection";

export const metadata: Metadata = {
  title: { absolute: "AI Studio — Free AI Logo Generator and Photo Enhancer" },
  description: "Generate an original logo from a short description, or enhance a photo in seconds. Free tier, no account needed, files deleted after processing.",
  openGraph: {
    title: "AI Studio — Free AI Logo Generator and Photo Enhancer",
    description: "Generate an original logo from a short description, or enhance a photo in seconds. Free tier, no account needed.",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "AI Studio — Free AI Logo Generator and Photo Enhancer" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Studio — Free AI Logo Generator and Photo Enhancer",
    description: "Generate an original logo from a short description, or enhance a photo in seconds. Free tier, no account needed.",
    images: ["/og.jpg"],
  },
};

const TOOLS = [
  {
    href: "/logo-generator", icon: Sparkles, title: "AI Logo Generator",
    desc: "Describe your brand and get an original, downloadable SVG logo. Pick a style and colours, then export SVG or PNG at 1024px.",
  },
  {
    href: "/photo-enhancer", icon: Wand2, title: "AI Photo Enhancer",
    desc: "Upload a JPG, PNG or WebP photo and get a sharper, upscaled version back. Compare before and after with a slider, then download PNG, JPG, or WebP.",
  },
];

const FAQS = [
  { q: "Is AI Studio really free?", a: `Yes. The free tier gives you ${LIMITS.logoRequestsFree} logo requests and ${LIMITS.photoCreditsFree} photo credits per day per visitor, with no account and no payment details. Signing in keeps the same free limits and adds saved logo history; Premium raises the limits to ${LIMITS.logoRequestsPremium} logo requests and ${LIMITS.photoCreditsPremium} photo credits per day and is sold through Paddle (see Pricing).` },
  { q: "What happens to my uploaded photos?", a: "Files are processed on our server and deleted immediately after processing (max 60 minutes in any case). We never list, share or train on them." },
  { q: "Can I use a generated logo for my business?", a: "Yes. Logos are generated as original geometry from your description. Prompts that reference existing brands, characters or public figures are refused, so the result is yours to use. For trademark registration, get independent legal advice." },
  { q: "Why does the enhancer sometimes say standard quality?", a: "When the AI upscaler is not configured or is unavailable, we fall back to a standard sharpening and upscaling pipeline and label it honestly. Standard results are still sharper and larger than the original, but they are not AI upscaling." },
];

const appLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "AI Studio",
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  url: "https://ai-studio-sandy-sigma.vercel.app",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://ai-studio-sandy-sigma.vercel.app/" },
    { "@type": "ListItem", position: 2, name: "Logo Generator", item: "https://ai-studio-sandy-sigma.vercel.app/logo-generator" },
    { "@type": "ListItem", position: 3, name: "Photo Enhancer", item: "https://ai-studio-sandy-sigma.vercel.app/photo-enhancer" },
  ],
};

export default function Home() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      {/* Hero — the one bold element: a thick pink frame with a serif-italic headline */}
      <section className="border-4 border-brand bg-white p-6 sm:p-10 dark:bg-slate-900">
        <p className="text-base font-semibold text-brand-dark">Free AI tools, no account needed</p>
        <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold italic leading-tight sm:text-5xl">
          Make a logo, or make a photo sharper. In under a minute.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-fg dark:text-slate-300">
          Two tools, done properly: original logos you can actually download and reuse, and photo
          enhancement that tells you honestly whether AI did the work.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/logo-generator" className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand-dark bg-brand-dark px-5 py-2.5 font-semibold text-white hover:bg-brand-dark">
            Generate a logo
          </Link>
          <Link href="/photo-enhancer" className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-accent-dark bg-accent-dark px-5 py-2.5 font-semibold text-white hover:bg-accent-dark">
            Enhance a photo
          </Link>
        </div>
      </section>

      <section aria-labelledby="tools-heading" className="mt-12">
        <h2 id="tools-heading" className="font-display text-3xl font-bold italic">Tools</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {TOOLS.map((t) => (
            <Link key={t.href} href={t.href} className="group block border-2 border-line bg-white p-6 hover:border-brand dark:bg-slate-900">
              <t.icon size={28} className="text-brand" aria-hidden="true" />
              <h3 className="mt-3 text-xl font-bold">{t.title}</h3>
              <p className="mt-2 text-muted-fg dark:text-slate-300">{t.desc}</p>
              <span className="mt-4 inline-block font-semibold text-brand-dark group-hover:underline">Open tool</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="how-heading" className="mt-12 border-2 border-line bg-white p-6 dark:bg-slate-900">
        <h2 id="how-heading" className="font-display text-3xl font-bold italic">How it works</h2>
        <ol className="mt-5 space-y-4">
          <li><strong>Describe or upload.</strong> Type a short logo idea, or drop in a photo (JPG, PNG or WebP, up to 10 MB).</li>
          <li><strong>Generate.</strong> The logo is drawn by an AI model and cleaned up on our server; the photo is upscaled and sharpened.</li>
          <li><strong>Download.</strong> Logos export as SVG or 1024px PNG. Photos download as PNG, JPG, or WebP. Your files are then deleted.</li>
        </ol>
      </section>

      <section aria-labelledby="trust-heading" className="mt-12">
        <h2 id="trust-heading" className="font-display text-3xl font-bold italic">Built to be trusted</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "Your files stay yours", text: "Processed in memory or temporary storage, deleted immediately after processing, never listed or shared." },
            { icon: Zap, title: "Honest labels", text: "The enhancer says clearly whether AI upscaling or standard processing produced your result. No inflated claims." },
            { icon: Download, title: "Real exports", text: "SVG logos and PNG files you can open anywhere — not screenshots, not watermarks on the free tier." },
          ].map((c) => (
            <div key={c.title} className="border-2 border-line bg-white p-5 dark:bg-slate-900">
              <c.icon size={24} className="text-accent" aria-hidden="true" />
              <h3 className="mt-2 text-lg font-bold">{c.title}</h3>
              <p className="mt-1 text-muted-fg dark:text-slate-300">{c.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="premium-heading" className="mt-12 border-2 border-accent bg-white p-6 dark:bg-slate-900">
        <h2 id="premium-heading" className="font-display text-3xl font-bold italic">Premium plan</h2>
        <p className="mt-2 max-w-xl text-muted-fg dark:text-slate-300">
          {LIMITS.logoRequestsPremium} logo requests and {LIMITS.photoCreditsPremium} photo credits per
          day, HD 4x export up to 4096px, face enhance, priority generation, and no ads. Premium is
          sold through Paddle — checkout is handled by Paddle as merchant of record, and no card
          details are ever entered on this site.
        </p>
        <Link href="/pricing" className="mt-4 inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand-dark bg-brand-dark px-5 py-2.5 font-semibold text-white">
          See Premium pricing
        </Link>
      </section>

      <section aria-labelledby="faq-heading" className="mt-12">
        <h2 id="faq-heading" className="font-display text-3xl font-bold italic">Frequently asked questions</h2>
        <div className="mt-5 space-y-4">
          {FAQS.map((f) => (
            <div key={f.q} className="border-2 border-line bg-white p-5 dark:bg-slate-900">
              <h3 className="text-lg font-bold">{f.q}</h3>
              <p className="mt-1 text-muted-fg dark:text-slate-300">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <RestoreSection />
    </div>
  );
}
