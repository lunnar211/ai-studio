import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AI Logo Maker — Original Logos from a Description",
  description:
    "Describe your brand and generate an original SVG logo in seconds, free. Download SVG or 1024 px PNG, try mockups, and regenerate with the same idea. Free tier: 10 requests per day, 3 variants each.",
  openGraph: {
    title: "AI Logo Maker | AI Studio",
    description:
      "Describe your brand and generate an original SVG logo in seconds, free. SVG + 1024 px PNG downloads, mockups included.",
    images: [{ url: "/og-logo.jpg", width: 1200, height: 630, alt: "AI Studio — make an original logo in seconds" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Logo Maker | AI Studio",
    description:
      "Describe your brand and generate an original SVG logo in seconds, free. SVG + 1024 px PNG downloads, mockups included.",
    images: ["/og-logo.jpg"],
  },
};

const faqs = [
  {
    q: "Are the logos really original?",
    a: "Yes — every logo is generated from your description as new vector art, and every result is checked for brand, character and celebrity resemblance. Prompts referencing existing brands are refused.",
  },
  {
    q: "What do I get to download?",
    a: "SVG (infinitely scalable, transparent background) and a 1024 px transparent PNG, plus a favicon set. Mockups show the logo on a card, a T-shirt and an app icon before you download.",
  },
  {
    q: "How much is free?",
    a: "10 logo requests per day on the free tier, with 3 variants per request. Premium raises that to 100 requests per day. The Premium price comes from Paddle at checkout — it is never invented on this page.",
  },
  {
    q: "Can I use the logo for my business?",
    a: "Yes — logos you generate are yours to use for your shop, site, packaging or social profiles. AI Studio does not claim ownership of your generated logo.",
  },
  {
    q: "What makes a good logo prompt?",
    a: "Name + what you do + one mark + one style. For example: “mountain coffee roaster, peak with a bean, badge style.” One mark beats four, and a readable name beats a clever one.",
  },
];

const appLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AI Studio Logo Maker",
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  description:
    "Generate an original SVG logo from a description. SVG + 1024 px PNG downloads, mockups, favicon set.",
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
    { "@type": "ListItem", position: 2, name: "Logo Generator", item: "https://ai-studio-sandy-sigma.vercel.app/logo-generator" },
    { "@type": "ListItem", position: 3, name: "AI Logo Maker" },
  ],
};

export default function LogoMakerPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbLd) }} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted-fg dark:text-slate-400">
        <Link href="/">Home</Link> {" / "} <Link href="/logo-generator">Logo Generator</Link> {" / "} AI Logo Maker
      </nav>
      <h1 className="mt-3 font-display text-4xl font-bold italic">AI logo maker</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-fg dark:text-slate-300">
        A new shop, a side project, a YouTube channel — all of them need a mark before they feel
        real, and a designer costs more than the idea is worth at the start. Describe the brand,
        get three original logo variants in seconds, and download the one that fits as SVG or
        high-resolution PNG.
      </p>
      <h2 className="mt-8 text-2xl font-bold">How it works</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-6 text-muted-fg dark:text-slate-300">
        <li>Describe your brand: name, what you do, and one mark you want (a cup, a peak, a leaf).</li>
        <li>Pick a style — flat, badge, minimal, hand-drawn, gradient or abstract — and a colour palette.</li>
        <li>Get 3 variants, ranked for readability, balance and scalability. Regenerate with the same idea if none fits.</li>
        <li>Preview mockups (card, T-shirt, app icon), then download SVG, 1024 px PNG, and a favicon set.</li>
      </ol>
      <h2 className="mt-8 text-2xl font-bold">What makes a logo work</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-fg dark:text-slate-300">
        <li>One mark, not four. A single cup, bean or peak is remembered; a collage is not.</li>
        <li>Readable at 16 px. If the name disappears as a favicon, simplify it.</li>
        <li>Three colours or fewer. More colours mean more printing cost and less recognition.</li>
        <li>Original, not familiar. Anything resembling an existing brand, character or celebrity is refused and re-ranked.</li>
      </ul>
      <Link
        href="/logo-generator"
        className="mt-8 inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand-dark bg-brand-dark px-5 py-2.5 font-semibold text-white"
      >
        Make my logo — free
      </Link>
      <p className="mt-4 text-sm text-muted-fg dark:text-slate-400">
        Free tier: 10 requests per day, 3 variants per request. Prompts referencing existing brands are refused.
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
        <li><Link href="/colorize-black-and-white-photo">Colorize black-and-white photos</Link> — add colour to old family photos.</li>
        <li><Link href="/restore-old-photos">Restore old photos</Link> — clean scratches and damage.</li>
        <li><Link href="/photo-upscaler">Photo upscaler</Link> — sharpen and enlarge photos to HD.</li>
        <li><Link href="/logo-generator">Logo generator</Link> — the tool itself, with examples and prompt chips.</li>
        <li><Link href="/pricing">Pricing</Link> — free vs Premium limits.</li>
      </ul>
    </div>
  );
}
