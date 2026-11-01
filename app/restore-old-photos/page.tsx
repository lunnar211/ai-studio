import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Restore Old Photos — Remove Scratches and Damage with AI",
  description:
    "Restore an old, scratched or faded photo: denoise, clean scratches, restore faces, and optionally colorize — free on AI Studio. Upload JPG, PNG or WebP up to 10 MB. Results are labelled honestly.",
  openGraph: {
    title: "Restore Old Photos | AI Studio",
    description:
      "Restore scratched, faded or damaged old photos with AI, then colorize them if you want. Free tier, honest quality labels.",
    images: [{ url: "/og-restore.jpg", width: 1200, height: 630, alt: "AI Studio — restore old damaged photos" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Restore Old Photos | AI Studio",
    description:
      "Restore scratched, faded or damaged old photos with AI, then colorize them if you want. Free tier, honest quality labels.",
    images: ["/og-restore.jpg"],
  },
};

const faqs = [
  {
    q: "What kind of damage can restoration fix?",
    a: "Light scratches, dust spots, grain, fading and soft faces. Deep tears, missing chunks or completely blurred faces cannot be invented back — the tool improves what is there, it does not guess new people or objects.",
  },
  {
    q: "Should I choose Restore + Colorize or just Colorize?",
    a: "If the photo is scratched, torn, faded or noisy, choose Restore + Colorize: it cleans the photo first, then adds colour. If the photo is clean and only black-and-white, plain Colorize is enough and cheaper.",
  },
  {
    q: "Will faces look natural after restoration?",
    a: "Faces are enhanced, not replaced. A face-enhance step sharpens eyes and features from the original pixels. If a face is too damaged, the result stays soft rather than inventing a different face.",
  },
  {
    q: "How much does restoration cost?",
    a: "Restore + Colorize is free and unlimited via the free routes. Premium adds faster paid-GPU processing, HD 4x and face enhance.",
  },
  {
    q: "Are my photos kept or shared?",
    a: "No. Server uploads are processed and deleted immediately after processing, and are never listed or shared.",
  },
];

const appLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AI Studio Photo Restoration",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  description:
    "Restore old, scratched or faded photos with AI: denoise, scratch cleanup, face restore, and optional colorization.",
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
    { "@type": "ListItem", position: 3, name: "Restore Old Photos" },
  ],
};

export default function RestorePage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbLd) }} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted-fg dark:text-slate-400">
        <Link href="/">Home</Link> {" / "} <Link href="/photo-enhancer">Photo Enhancer</Link> {" / "} Restore
      </nav>
      <h1 className="mt-3 font-display text-4xl font-bold italic">Restore old photos</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-fg dark:text-slate-300">
        Paper photos age: they scratch in albums, fade in sunlight, collect dust, and go soft around
        the faces that matter most. Restoration cleans up that wear — noise, scratches and fading —
        and sharpens faces from the original pixels, so the photo looks the way you remember it,
        not like a different photo.
      </p>
      <h2 className="mt-8 text-2xl font-bold">How it works</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-6 text-muted-fg dark:text-slate-300">
        <li>Open the photo enhancer and choose the Restore + Colorize mode (or Enhance for a clean photo that only needs sharpening).</li>
        <li>Upload the old photo (JPG, PNG or WebP, up to 10 MB). A scanned photo works best — scan at 300 dpi or higher if you can.</li>
        <li>The tool restores first — denoise, scratch cleanup, face restore — then colorizes if you asked for colour.</li>
        <li>Compare before and after on the slider, then download as PNG, JPG or WebP.</li>
      </ol>
      <h2 className="mt-8 text-2xl font-bold">What to know before you start</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-fg dark:text-slate-300">
        <li>Restoration improves what is there. It cannot rebuild a face or object that is entirely missing from the photo.</li>
        <li>Scan, don&apos;t photograph, the original when possible — a flat scan gives the tool far more detail than a phone photo of a print.</li>
        <li>If you add colour, the colours are estimates, and the result is labelled as such.</li>
        <li>Very large scans are handled safely: big inputs are scaled down before processing, and Premium users can export up to 4096 px.</li>
      </ul>
      <Link
        href="/photo-enhancer?mode=restore"
        className="mt-8 inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand-dark bg-brand-dark px-5 py-2.5 font-semibold text-white"
      >
        Restore my photo — free
      </Link>
      <p className="mt-4 text-sm text-muted-fg dark:text-slate-400">
        Free: unlimited restore via the free routes.
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
        <li><Link href="/photo-upscaler">Photo upscaler</Link> — sharpen and enlarge any photo to HD.</li>
        <li><Link href="/ai-logo-maker">AI logo maker</Link> — an original logo from a description.</li>
        <li><Link href="/photo-enhancer">Photo enhancer</Link> — all three modes in one tool.</li>
        <li><Link href="/pricing">Pricing</Link> — free vs Premium limits.</li>
      </ul>
    </div>
  );
}
