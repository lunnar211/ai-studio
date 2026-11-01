import type { Metadata } from "next";
import { LogoTool } from "./LogoTool";

export const metadata: Metadata = {
  title: "AI Logo Generator — Original Logos from a Description",
  description: "Describe your brand and generate an original SVG logo. Download SVG or 1024px PNG. Free and unlimited. Brand and celebrity prompts are refused.",
  openGraph: {
    title: "AI Logo Generator | AI Studio",
    description: "Describe your brand and generate an original SVG logo. Download SVG or 1024px PNG.",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "AI Studio logo generator" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Logo Generator | AI Studio",
    description: "Describe your brand and generate an original SVG logo. Download SVG or 1024px PNG.",
    images: ["/og.jpg"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AI Studio Logo Generator",
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    { "@type": "Question", name: "Can I use the logo commercially?", acceptedAnswer: { "@type": "Answer", text: "Yes. Logos are generated as original geometry from your description. Prompts referencing existing brands, characters or public figures are refused." } },
    { "@type": "Question", name: "What file formats can I download?", acceptedAnswer: { "@type": "Answer", text: "SVG (vector, infinitely scalable) and PNG at 1024 by 1024 pixels with a transparent background." } },
    { "@type": "Question", name: "Why was my prompt refused?", acceptedAnswer: { "@type": "Answer", text: "Prompts that reference trademarked brands, copyrighted characters, celebrities or existing logos are refused. Rephrase with an original concept." } },
  ],
};

export default function LogoPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <h1 className="font-display text-4xl font-bold italic">Get a professional logo in 10 seconds. Free.</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-fg dark:text-slate-300">
        Describe your brand in plain words — what it does, what feeling it should give — and get
        three original logo variants you can download as SVG or PNG. No account, no design skills needed.
      </p>
      <a href="#logo-prompt" className="mt-4 inline-block rounded-lg bg-pink-600 px-6 py-3 font-semibold text-white hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500">
        Generate my logo — free
      </a>
      <p className="mt-3 max-w-2xl border-2 border-line bg-white p-3 text-sm dark:bg-slate-900">
        <strong>AI disclosure:</strong> every logo here is AI-generated from your
        prompt. Your prompt is sent to our text-generation service to produce the logo; it is not used to train models.
        Outputs are labelled AI-generated in the tool itself.
      </p>
      <LogoTool />
      <section aria-labelledby="how-logo" className="mt-12 border-2 border-line bg-white p-6 dark:bg-slate-900">
        <h2 id="how-logo" className="font-display text-2xl font-bold italic">How to get a good logo</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-6">
          <li>Write what the business does, not just its name: “a mountain coffee roaster” beats “coffee”.</li>
          <li>Add one visual idea: a shape, an animal, a plant, or a symbol that fits the business.</li>
          <li>Pick a style. Minimal suits tech and services; badge suits food, outdoor and craft brands.</li>
          <li>Generate again with a small change if the first result is close but not right — colour or shape, one at a time.</li>
        </ol>
        <h3 className="mt-6 text-lg font-bold">Good uses</h3>
        <p className="mt-1 text-muted-fg dark:text-slate-300">
          Website headers, social profiles, business cards, packaging mockups, pitch decks and app icons.
          SVG scales cleanly from a favicon to a shop sign.
        </p>
        <h3 className="mt-6 text-lg font-bold">What we refuse</h3>
        <p className="mt-1 text-muted-fg dark:text-slate-300">
          Prompts referencing trademarked brands, copyrighted characters, celebrities or existing logos
          are refused with a clear message. The generator makes original work only.
        </p>
        <p className="mt-4 text-sm text-muted-fg dark:text-slate-400">
          Files are processed on our server and deleted immediately after processing (max 60 minutes in any case);
          we never list or share them. Logo generation is free and unlimited; one request gives 3 variants.
        </p>
      </section>
      <section aria-labelledby="faq-logo" className="mt-8">
        <h2 id="faq-logo" className="font-display text-2xl font-bold italic">Questions</h2>
        <div className="mt-4 space-y-4">
          <div className="border-2 border-line bg-white p-5 dark:bg-slate-900"><h3 className="font-bold">Can I use the logo commercially?</h3><p className="mt-1 text-muted-fg dark:text-slate-300">Yes, for your own business, products and marketing. For trademark registration, get independent legal advice.</p></div>
          <div className="border-2 border-line bg-white p-5 dark:bg-slate-900"><h3 className="font-bold">What formats can I download?</h3><p className="mt-1 text-muted-fg dark:text-slate-300">SVG for vector editing and scaling, and PNG at 1024 by 1024 pixels with a transparent background.</p></div>
          <div className="border-2 border-line bg-white p-5 dark:bg-slate-900"><h3 className="font-bold">Why was my prompt refused?</h3><p className="mt-1 text-muted-fg dark:text-slate-300">It matched a brand, character or public figure. Rephrase with an original concept and try again.</p></div>
        </div>
      </section>
    </div>
  );
}
