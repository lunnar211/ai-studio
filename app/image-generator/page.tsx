import type { Metadata } from "next";
import Link from "next/link";
import { ImageGeneratorTool } from "./ImageGeneratorTool";

export const metadata: Metadata = {
  title: "AI Image Generator — Create Images from Text",
  description:
    "Describe an image and generate it with AI. Sign-in required, 10 images a day on Free and 100 a day on Premium, 1 credit per image. Download the result in full.",
  openGraph: {
    title: "AI Image Generator | AI Studio",
    description:
      "Describe an image and generate it with AI. Sign-in required, daily budget applies, download included.",
    images: [{ url: "/og-logo.jpg", width: 1200, height: 630, alt: "AI Studio — generate images from text" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Image Generator | AI Studio",
    description: "Describe an image and generate it with AI. Sign-in required, daily budget applies.",
    images: ["/og-logo.jpg"],
  },
};

const faqs = [
  {
    q: "Do I need an account?",
    a: "Yes. Image generation bills the service per image, so it needs an account to count your daily budget. Guests can use the photo enhancer and logo maker without signing in, but not image generation.",
  },
  {
    q: "How many images can I generate?",
    a: "10 images a day on Free, 100 a day on Premium. Each image uses 1 credit. The page shows how many you have left after each generation.",
  },
  {
    q: "What sizes can I pick?",
    a: "Square (1:1), Portrait (3:4), Landscape (4:3), or Wide (16:9). The size you pick is the shape of the generated image.",
  },
  {
    q: "Can I use the image for my business?",
    a: "Yes — images you generate here are yours to use for your shop, site, or social profiles. Prompts referencing existing brands, characters, or public figures are refused.",
  },
];

const appLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AI Studio Image Generator",
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  description: "Generate raster images from a text description. Sign-in required, daily budget applies.",
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

export default function ImageGeneratorPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted-fg dark:text-slate-400">
        <Link href="/">Home</Link> {" / "} AI Image Generator
      </nav>
      <h1 className="mt-3 font-display text-4xl font-bold italic">AI image generator</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-fg dark:text-slate-300">
        Describe the image you want — a subject, a setting, a style — and get a finished picture
        back, ready to download. Every image is generated fresh from your description; nothing
        here is a stock photo.
      </p>
      <p className="mt-3 max-w-2xl border-2 border-line bg-white p-3 text-sm dark:bg-slate-900">
        Sign-in required. Each image uses 1 credit: 10 images a day on Free, 100 a day on Premium.
        Generation is never unlimited, because every image bills the service — the budget above
        is what keeps it running.
      </p>
      <ImageGeneratorTool />
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
        <li><Link href="/logo-generator">Logo generator</Link> — original vector logos from a description.</li>
        <li><Link href="/photo-enhancer">Photo enhancer</Link> — colorize, restore, and upscale real photos.</li>
        <li><Link href="/pricing">Pricing</Link> — Free vs Premium limits.</li>
      </ul>
    </div>
  );
}
