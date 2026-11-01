import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Colorize Black-and-White Photos — Free AI Photo Colorization",
  description:
    "Turn an old black-and-white photo into colour, free, in your browser or on our server. Upload a JPG, PNG or WebP up to 10 MB. Colours are estimates, not the original colours — every result is labelled honestly.",
  openGraph: {
    title: "Colorize Black-and-White Photos | AI Studio",
    description:
      "Turn an old black-and-white photo into colour, free. Browser colorization is unlimited and your photo never leaves your device.",
    images: [{ url: "/og-colorize.jpg", width: 1200, height: 630, alt: "AI Studio — colorize black-and-white photos" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Colorize Black-and-White Photos | AI Studio",
    description:
      "Turn an old black-and-white photo into colour, free. Browser colorization is unlimited and your photo never leaves your device.",
    images: ["/og-colorize.jpg"],
  },
};

const faqs = [
  {
    q: "Are the colours the real original colours?",
    a: "No. Colorization estimates plausible colours from the shapes, light and context in the photo. The result is labelled “AI colorized: colours are estimated” so nobody mistakes it for the original.",
  },
  {
    q: "Is colorizing really free?",
    a: "Yes. Colorize in your browser is unlimited and free, and your photo never leaves your device. Server colorize uses 2 photo credits; the free tier gives 10 photo credits per day.",
  },
  {
    q: "What photos work best?",
    a: "Clear portraits, family photos and street scenes with good contrast. Very dark, blurry or heavily damaged photos may come out muted — try Restore + Colorize for those.",
  },
  {
    q: "What file types and sizes are accepted?",
    a: "JPG, PNG and WebP up to 10 MB, verified by file content, not just the file name. Rotated phone photos are fixed automatically.",
  },
  {
    q: "Are my photos kept or shared?",
    a: "No. Server uploads are processed and deleted immediately after processing, and are never listed or shared. In browser mode the photo never leaves your device at all.",
  },
];

const appLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AI Studio Photo Colorization",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  description:
    "Colorize black-and-white photos with AI, in the browser or on the server. Colours are estimates, not the original colours.",
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
    { "@type": "ListItem", position: 3, name: "Colorize Black-and-White Photos" },
  ],
};

export default function ColorizePage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbLd) }} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted-fg dark:text-slate-400">
        <Link href="/">Home</Link> {" / "} <Link href="/photo-enhancer">Photo Enhancer</Link> {" / "} Colorize
      </nav>
      <h1 className="mt-3 font-display text-4xl font-bold italic">Colorize black-and-white photos</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-fg dark:text-slate-300">
        That box of old family photos — grandparents on a wedding day, a parent as a child, a street
        from decades ago — was shot in black and white because that was the film available. AI
        colorization adds plausible colour back, so the people in the photo feel closer and easier
        to recognize for the next generation.
      </p>
      <h2 className="mt-8 text-2xl font-bold">How it works</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-6 text-muted-fg dark:text-slate-300">
        <li>Open the photo enhancer and choose the Colorize mode.</li>
        <li>Upload your black-and-white photo (JPG, PNG or WebP, up to 10 MB).</li>
        <li>Pick a colour style — Natural, Vivid, Warm vintage or Cool — and adjust the colour intensity.</li>
        <li>Download the colorized photo as PNG, JPG or WebP, and compare it with the original on the before/after slider.</li>
      </ol>
      <h2 className="mt-8 text-2xl font-bold">What to know before you start</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-fg dark:text-slate-300">
        <li>Colours are estimates. Skin, clothes and skies get believable colours, but they are not a record of the real colours that day.</li>
        <li>Detail is preserved: the original brightness is kept and only colour is added, so faces stay sharp instead of smeared.</li>
        <li>Damaged or scratched originals do better with Restore + Colorize, which cleans the photo first.</li>
        <li>Colour photos are refused for colorize — pick Enhance for those instead.</li>
      </ul>
      <Link
        href="/photo-enhancer?mode=colorize"
        className="mt-8 inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand bg-brand px-5 py-2.5 font-semibold text-white"
      >
        Colorize my photo — free
      </Link>
      <p className="mt-4 text-sm text-muted-fg dark:text-slate-400">
        Free tier: 10 photo credits per day; Colorize costs 2 credits on the server. Browser colorization is unlimited and free.
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
        <li><Link href="/restore-old-photos">Restore old photos</Link> — clean scratches and damage before colorizing.</li>
        <li><Link href="/photo-upscaler">Photo upscaler</Link> — sharpen and enlarge any photo to HD.</li>
        <li><Link href="/ai-logo-maker">AI logo maker</Link> — an original logo from a description.</li>
        <li><Link href="/photo-enhancer">Photo enhancer</Link> — all three modes in one tool.</li>
        <li><Link href="/pricing">Pricing</Link> — free vs Premium limits.</li>
      </ul>
    </div>
  );
}
