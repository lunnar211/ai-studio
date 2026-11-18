import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { RestoreSection } from "@/components/site/RestoreSection";
import { PhotoAvailability } from "@/components/site/PhotoAvailability";
import { DarkroomSlider } from "@/components/site/DarkroomSlider";

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

// The workbench: four named workstations, each with the one thing you
// walk away with. Image Generator and Audio Cleaner need a sign-in —
// said on the card, not discovered after a redirect.
const WORKBENCH = [
  {
    href: "/logo-generator", name: "Logo bench",
    walkAway: "You walk away with an SVG file",
    desc: "Describe your brand and get an original, downloadable SVG logo. Pick a style and colours, then export SVG or PNG at 1024px.",
    signIn: false,
  },
  {
    href: "/photo-enhancer", name: "Photo darkroom",
    walkAway: "You walk away with a sharper PNG",
    desc: "Upload a JPG, PNG or WebP photo and get a sharper, upscaled version back. Compare before and after with a slider, then download PNG, JPG, or WebP.",
    signIn: false,
  },
  {
    href: "/image-generator", name: "Image bench",
    walkAway: "You walk away with a finished picture",
    desc: "Describe an image and get a finished picture back, ready to download. 10 images a day on Free, 1 credit per image.",
    signIn: true,
  },
  {
    href: "/audio-cleaner", name: "Audio bench",
    walkAway: "You walk away with a clean WAV",
    desc: "Upload an audio file, and clean it in your browser: noise gate, trim, and normalize. Preview before and after, then download WAV. The file never leaves your device.",
    signIn: true,
  },
];

const FAQS = [
  { q: "Is AI Studio really free?", a: `Yes. Photo enhance is free and unlimited, with no account and no payment details. Logo generation is free and unlimited too — one logo request gives 3 variants. Colorize and restore are part of the free tier, and the photo enhancer shows whether they are available at the moment. The only limit anywhere is abuse protection: 5 requests per minute per visitor. Signing in keeps the same free use and adds saved logo history; Premium adds fast paid-GPU photo processing, HD 4x, face enhance and priority, and is sold through Paddle (see Pricing).` },
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
      {/* Hero — the one bold element: a thick pink frame around a live
          darkroom. Drag the slider on a real 19th-century portrait; the
          tool is demonstrated, not described. */}
      <section className="border-4 border-brand bg-white p-6 sm:p-10 dark:bg-slate-900">
        <p className="text-base font-semibold text-brand-dark">Free tools, no account needed for the free tier</p>
        <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold italic leading-tight sm:text-5xl">
          Old photos, made sharper. Logos, made from scratch.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-fg dark:text-slate-300">
          A small darkroom and a logo bench, not a dashboard. Drag the slider below —
          that is the photo tool working on a real old portrait, right here on this page.
        </p>
        <DarkroomSlider />
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/logo-generator" className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand-dark bg-brand-dark px-5 py-2.5 font-semibold text-white hover:bg-brand-dark">
            Generate a logo
          </Link>
          <Link href="/photo-enhancer" className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-accent-dark bg-accent-dark px-5 py-2.5 font-semibold text-white hover:bg-accent-dark">
            Enhance a photo
          </Link>
        </div>
      </section>

      <section aria-labelledby="workbench-heading" className="mt-12">
        <h2 id="workbench-heading" className="font-display text-3xl font-bold italic">The workbench</h2>
        <p className="mt-3 max-w-2xl text-muted-fg dark:text-slate-300">
          Four workstations. Pick one, do the job, leave with the file.
        </p>
        <div className="mt-5 space-y-5">
          {WORKBENCH.map((t) => (
            <Link key={t.href} href={t.href} className="group block border-2 border-line bg-white p-6 hover:border-brand dark:bg-slate-900">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-xl font-bold">{t.name}</h3>
                {t.signIn && (
                  <span className="rounded-[3px] border-2 border-line bg-cream px-2 py-0.5 font-semibold text-brand-dark dark:bg-slate-800">
                    Sign in required
                  </span>
                )}
              </div>
              <p className="mt-2 font-semibold text-brand-dark">{t.walkAway}</p>
              <p className="mt-1 text-muted-fg dark:text-slate-300">{t.desc}</p>
              <span className="mt-4 inline-block font-semibold text-brand-dark group-hover:underline">Open the {t.name.toLowerCase()}</span>
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

      <section aria-labelledby="premium-heading" className="mt-12 border-2 border-accent bg-white p-6 dark:bg-slate-900">
        <h2 id="premium-heading" className="font-display text-3xl font-bold italic">Premium plan</h2>
        <p className="mt-2 max-w-xl text-muted-fg dark:text-slate-300">
          Unlimited logo requests, unlimited
          photo enhance via the free route. Premium adds fast
          paid-GPU photo processing, HD 4x export up to 4096px, face enhance, priority generation, and no ads. Premium is
          sold through Paddle — checkout is handled by Paddle as merchant of record, and no card
          details are ever entered on this site.
        </p>
        <PhotoAvailability />
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

      <section aria-labelledby="gallery-heading" className="mt-12">
        <h2 id="gallery-heading" className="font-display text-3xl font-bold italic">Old photos you can try it on</h2>
        <p className="mt-3 max-w-2xl text-muted-fg dark:text-slate-300">
          No old photo handy? These are real 19th-century photographs from the public domain,
          shown here in black and white. They are originals, not results — open the enhancer and
          enhance one yourself to see what the tool does.
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          {[
            {
              src: "/gallery/man-19th-century.jpg",
              alt: "Black-and-white 19th-century studio portrait of a man",
              title: "Studio portrait, 19th century",
              credit: "Public domain via Wikimedia Commons",
              file: "https://commons.wikimedia.org/wiki/File:19th_century_Photograph_-_man.jpg",
            },
            {
              src: "/gallery/woman-19th-century.jpg",
              alt: "Black-and-white 19th-century studio portrait of a woman",
              title: "Studio portrait, 19th century",
              credit: "Public domain via Wikimedia Commons",
              file: "https://commons.wikimedia.org/wiki/File:19th_century_Photograph_-_woman.jpg",
            },
            {
              src: "/gallery/jeremiah-gurney.jpg",
              alt: "Black-and-white self-portrait of photographer Jeremiah Gurney",
              title: "Jeremiah Gurney, self-portrait",
              credit: "Public domain via Wikimedia Commons",
              file: "https://commons.wikimedia.org/wiki/File:Self-portrait_of_Jeremiah_Gurney.jpg",
            },
          ].map((g) => (
            <figure key={g.src} className="border-2 border-line bg-white p-3 dark:bg-slate-900">
              <Image src={g.src} alt={g.alt} width={800} height={1200} sizes="(max-width: 640px) 100vw, 380px" loading="lazy" className="h-auto w-full object-contain" />
              <figcaption className="mt-3">
                <p className="font-semibold">{g.title}</p>
                <p className="mt-1 text-muted-fg dark:text-slate-400">
                  {g.credit} — <Link href={g.file} className="underline">source file</Link>
                </p>
                <Link href="/photo-enhancer" className="mt-3 inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand-dark bg-brand-dark px-4 font-semibold text-white">
                  Try it in the photo enhancer
                </Link>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}
