import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Photo Upscaler — Sharpen and Enlarge Photos to HD",
  description:
    "Upscale a small or blurry photo to sharp HD with AI Studio, free. Upload JPG, PNG or WebP up to 10 MB, get up to 2048 px free and 4096 px on Premium. Results carry an honest AI or standard-quality label.",
  openGraph: {
    title: "Photo Upscaler | AI Studio",
    description:
      "Upscale a small or blurry photo to sharp HD. Free up to 2048 px, Premium up to 4096 px with face enhance.",
    images: [{ url: "/og-upscaler.jpg", width: 1200, height: 630, alt: "AI Studio — upscale photos to sharp HD" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Photo Upscaler | AI Studio",
    description:
      "Upscale a small or blurry photo to sharp HD. Free up to 2048 px, Premium up to 4096 px with face enhance.",
    images: ["/og-upscaler.jpg"],
  },
};

const faqs = [
  {
    q: "How much can a photo be enlarged?",
    a: "Free exports go up to 2048 px on the longest edge; Premium exports go up to 4096 px and include face enhance. A 2x or 4x scale is offered where the source allows it.",
  },
  {
    q: "Does upscaling add detail that was not there?",
    a: "Upscaling sharpens edges and reconstructs plausible texture from the photo itself. It cannot recover text, faces or objects that were never captured — very tiny thumbnails stay soft, just larger and cleaner.",
  },
  {
    q: "What is the difference between AI Enhanced and Standard quality?",
    a: "AI Enhanced means an AI model processed the photo; Standard means a standard sharpening pipeline ran on our own server. Every result carries one of these two badges, and nothing else is claimed.",
  },
  {
    q: "How much does upscaling cost?",
    a: "Enhance is free and unlimited via the free routes. Premium adds faster paid-GPU processing, HD 4x up to 4096px and face enhance.",
  },
  {
    q: "Are my photos kept or shared?",
    a: "No. Server uploads are processed and deleted immediately after processing, and are never listed or shared.",
  },
];

const appLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AI Studio Photo Upscaler",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  description:
    "Upscale small or blurry photos to sharp HD. Free up to 2048 px, Premium up to 4096 px with face enhance.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const crumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://ai-studio-sandy-sigma.vercel.app/" },
    { "@type": "ListItem", position: 2, name: "Photo Enhancer", item: "https://ai-studio-sandy-sigma.vercel.app/photo-enhancer" },
    { "@type": "ListItem", position: 3, name: "Photo Upscaler" },
  ],
};

export default function UpscalerPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbLd) }} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted-fg dark:text-slate-400">
        <Link href="/">Home</Link> {" / "} <Link href="/photo-enhancer">Photo Enhancer</Link> {" / "} Upscaler
      </nav>
      <h1 className="mt-3 font-display text-4xl font-bold italic">Photo upscaler</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-fg dark:text-slate-300">
        Old phone photos, cropped screenshots and tiny downloaded images all share one problem:
        they fall apart the moment you print them or view them full-screen. An upscaler rebuilds
        them at a larger size with sharper edges and cleaner texture, so a small photo can survive
        a print, a poster, or a big screen.
      </p>
      <h2 className="mt-8 text-2xl font-bold">How it works</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-6 text-muted-fg dark:text-slate-300">
        <li>Open the photo enhancer and choose Enhance (or Colorize + HD for a black-and-white photo).</li>
        <li>Upload your photo (JPG, PNG or WebP, up to 10 MB).</li>
        <li>Pick the output size and format — PNG, JPG or WebP — and turn on face enhance on Premium for portraits.</li>
        <li>Compare before and after on the slider, then download.</li>
      </ol>
      <h2 className="mt-8 text-2xl font-bold">What to know before you start</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-fg dark:text-slate-300">
        <li>Upscaling works best on photos that are small but not destroyed: a decent 800 px photo upscales beautifully, a 100 px thumbnail improves but stays soft.</li>
        <li>Text and fine print do not get invented — if letters were unreadable before, they stay unreadable, just larger.</li>
        <li>Colour photos use Enhance; black-and-white photos use Colorize (with an HD option) or Restore + Colorize.</li>
        <li>Very large uploads are scaled down before AI processing for speed, then exported at the size you picked.</li>
      </ul>
      <Link
        href="/photo-enhancer"
        className="mt-8 inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand-dark bg-brand-dark px-5 py-2.5 font-semibold text-white"
      >
        Upscale my photo — free
      </Link>
      <p className="mt-4 text-sm text-muted-fg dark:text-slate-400">
        Free: unlimited enhance via the free routes. Premium: up to 4096 px with face enhance.
      </p>
      <h2 className="mt-10 text-2xl font-bold">Frequently asked questions</h2>
      <div className="mt-3 space-y-4">
        {faqs.map((f) => (
          <div key={f.q}>
            <h3 className="font-semibold">{f.q}</h3>
            <p className="mt-1 text-muted-fg dark:text-slate-300">{f.a}</p>
          </div>
        ))}
      </div>
      <h2 className="mt-10 text-2xl font-bold">Related tools</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li><Link href="/colorize-black-and-white-photo">Colorize black-and-white photos</Link> — add colour to a clean black-and-white photo.</li>
        <li><Link href="/restore-old-photos">Restore old photos</Link> — clean scratches and damage before upscaling.</li>
        <li><Link href="/ai-logo-maker">AI logo maker</Link> — an original logo from a description.</li>
        <li><Link href="/photo-enhancer">Photo enhancer</Link> — all three modes in one tool.</li>
        <li><Link href="/pricing">Pricing</Link> — free vs Premium limits.</li>
      </ul>
    </div>
  );
}
