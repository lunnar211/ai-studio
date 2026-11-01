import type { Metadata } from "next";
import Link from "next/link";
import { CrossPromo } from "@/components/site/CrossPromo";

export const metadata: Metadata = {
  title: "FAQ — AI Studio",
  description: "Frequently asked questions about AI Studio: free limits, logo downloads, photo enhancement, privacy, and Premium checkout through Paddle.",
  openGraph: {
    title: "FAQ | AI Studio",
    description: "Answers about free limits, downloads, privacy, and Premium.",
  },
};

const FAQS = [
  {
    q: "Is AI Studio really free?",
    a: "Yes. The free tier gives you 10 logo requests and 10 photo enhancements per day, with no account and no payment details. One logo request gives 3 variants and uses 1 credit. Signing in keeps the same free limits and adds saved logo history; Premium raises the limits to 100 per day.",
  },
  {
    q: "What do I get from the logo generator?",
    a: "Three original SVG logo variants per request, from your description, style, colours, and optional brand name. Download any variant as SVG (infinitely scalable) or PNG at 1024 by 1024 pixels, or copy its SVG code. Click a variant to see it mocked up on a business card, a T-shirt, and an app icon.",
  },
  {
    q: "Can I use the logos commercially?",
    a: "Yes, for your own business, products, and marketing. Logos are generated as original geometry from your description. For trademark registration, get independent legal advice.",
  },
  {
    q: "Why was my prompt refused?",
    a: "Prompts referencing trademarked brands, copyrighted characters, celebrities, or existing logos are refused with a clear message. Rephrase with an original concept and try again.",
  },
  {
    q: "How does the photo enhancer work?",
    a: "Upload a JPG, PNG, or WebP image up to 10 MB. The server upscales and sharpens it; when a Replicate token is configured, AI upscaling (Real-ESRGAN) is used, otherwise a standard Sharp upscale is used — and the result is always labelled honestly. Download the result as PNG or JPG, and drag the slider to compare before and after.",
  },
  {
    q: "What happens to my photos and prompts?",
    a: "Files are processed on the server and deleted immediately after processing (max 60 minutes in any case). We never list or share them. Prompts are sent to Groq to produce logos; they are not used to train models.",
  },
  {
    q: "How do I pay for Premium?",
    a: "Premium checkout is handled by Paddle as merchant of record — no card details are ever entered on this site. The Premium price is set in Paddle and shown at checkout. Paid plans require age 18+. See Pricing and the Refund Policy.",
  },
  {
    q: "Do I need an account?",
    a: "No, for the free tier. Signing in with Google saves your logo history (with favorites) and keeps your usage on your account instead of your device. Guest generations are not saved.",
  },
  {
    q: "What if generation fails or the AI is busy?",
    a: "You get an honest message, never a fake logo. If the AI service is rate-limited, wait a minute and try again. If a logo comes back unusable, the server retries automatically before answering.",
  },
];

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function FaqPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <h1 className="font-display text-4xl font-bold italic">Frequently asked questions</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-fg dark:text-slate-300">
        Short answers about the free tier, downloads, privacy, and Premium.
      </p>
      <div className="mt-8 space-y-4">
        {FAQS.map((f) => (
          <div key={f.q} className="border-2 border-line bg-white p-5 dark:bg-slate-900">
            <h2 className="text-lg font-bold">{f.q}</h2>
            <p className="mt-1 text-muted-fg dark:text-slate-300">{f.a}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-muted-fg dark:text-slate-300">
        Still stuck? <Link href="/contact" className="underline">Contact us</Link> or try the{" "}
        <Link href="/logo-generator" className="underline">logo generator</Link>.
      </p>
      <CrossPromo />
    </div>
  );
}
