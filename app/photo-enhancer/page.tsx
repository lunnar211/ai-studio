import type { Metadata } from "next";
import { EnhancerTool } from "./EnhancerTool";
import { CrossPromo } from "@/components/site/CrossPromo";

export const metadata: Metadata = {
  title: "AI Photo Enhancer — Sharpen and Upscale Photos",
  description: "Upload a JPG, PNG or WebP photo up to 10 MB and get a sharper, upscaled PNG back. Before/after slider included. Results are labelled AI or standard quality honestly.",
  openGraph: {
    title: "AI Photo Enhancer | AI Studio",
    description: "Upload a photo and get a sharper, upscaled PNG back, with an honest AI or standard-quality label.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AI Studio Photo Enhancer",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    { "@type": "Question", name: "What is the difference between AI and standard quality?", acceptedAnswer: { "@type": "Answer", text: "AI quality uses a neural upscaler when configured. Standard quality uses sharpening and upscaling without AI, and is labelled as such." } },
    { "@type": "Question", name: "What file types and sizes are accepted?", acceptedAnswer: { "@type": "Answer", text: "JPG, PNG and WebP images up to 10 MB, verified by file content, not just the file name." } },
    { "@type": "Question", name: "Are my photos kept or shared?", acceptedAnswer: { "@type": "Answer", text: "No. Files are processed on our server and deleted immediately after processing, and are never listed or shared." } },
  ],
};

export default function EnhancerPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <h1 className="font-display text-4xl font-bold italic">AI Photo Enhancer</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-fg dark:text-slate-300">
        Upload a photo and get a sharper, larger version back. Drag the slider to compare before and
        after, then download the result as PNG. The result is always labelled honestly: AI enhanced,
        or enhanced at standard quality.
      </p>
      <p className="mt-3 max-w-2xl border-2 border-line bg-white p-3 text-sm dark:bg-slate-900">
        <strong>AI disclosure:</strong> when AI upscaling is available, your image is sent to the
        Replicate API for processing and the result is labelled AI-generated. Otherwise a standard
        sharpening pipeline runs on our own server and is labelled standard quality, never AI.
        Uploads are deleted after processing and are never stored or shown to anyone else.
      </p>
      <EnhancerTool />
      <section aria-labelledby="how-enhance" className="mt-12 border-2 border-line bg-white p-6 dark:bg-slate-900">
        <h2 id="how-enhance" className="font-display text-2xl font-bold italic">How to get the best result</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-6">
          <li>Start with the largest original you have. Enhancement sharpens detail; it cannot invent a photo that was never there.</li>
          <li>Use photos of people, products, landscapes or documents. Very blurry or tiny thumbnails improve less.</li>
          <li>Compare with the slider before downloading, and keep your original — enhancement replaces nothing.</li>
        </ol>
        <h3 className="mt-6 text-lg font-bold">Good uses</h3>
        <p className="mt-1 text-muted-fg dark:text-slate-300">
          Old family photos, product shots for a shop page, social posts, scanned documents and
          presentation images.
        </p>
        <p className="mt-4 text-sm text-muted-fg dark:text-slate-400">
          Please do not upload abusive or illegal content. Uploads are checked by file type and size;
          there is no external content-moderation service at launch. Files are processed on our server
          and deleted immediately after processing (max 60 minutes in any case); we never list or share them.
          Free tier: 10 enhancements per day per visitor.
        </p>
      </section>
      <section aria-labelledby="faq-enhance" className="mt-8">
        <h2 id="faq-enhance" className="font-display text-2xl font-bold italic">Questions</h2>
        <div className="mt-4 space-y-4">
          <div className="border-2 border-line bg-white p-5 dark:bg-slate-900"><h3 className="font-bold">What is the difference between AI and standard quality?</h3><p className="mt-1 text-muted-fg dark:text-slate-300">AI quality uses a neural upscaler when it is configured and available. Standard quality sharpens and upscales without AI. The label on your result always says which one you got.</p></div>
          <div className="border-2 border-line bg-white p-5 dark:bg-slate-900"><h3 className="font-bold">What files are accepted?</h3><p className="mt-1 text-muted-fg dark:text-slate-300">JPG, PNG and WebP up to 10 MB. The file content is checked, not just the extension.</p></div>
          <div className="border-2 border-line bg-white p-5 dark:bg-slate-900"><h3 className="font-bold">Are my photos kept?</h3><p className="mt-1 text-muted-fg dark:text-slate-300">No. They are processed and deleted immediately after processing, and never listed or shared.</p></div>
        </div>
      </section>
      <CrossPromo />
    </div>
  );
}
