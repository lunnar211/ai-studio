import Link from "next/link";
import { Upload, Wand2, Download } from "lucide-react";

// Shared "Old photo restoration" + 3-step How-it-works section for the
// home and photo-enhancer pages. Copy only — no images are claimed:
// the gallery of real examples is deferred until verified
// public-domain photos are in hand (see CHANGELOG), so nothing here
// presents a synthetic image as a real photo.
export function RestoreSection() {
  return (
    <section aria-labelledby="restore-heading" className="mt-12">
      <h2 id="restore-heading" className="font-display text-3xl font-bold italic">Old photo restoration</h2>
      <p className="mt-2 max-w-3xl text-muted-fg dark:text-slate-300">
        Faded family photos, scratched scans, and black-and-white portraits from decades ago — for students,
        shops, and families in Nepal and worldwide. Restore brings back detail and sharpness; Colorize adds
        estimated colour (always labelled &quot;AI colorized: colours are estimated&quot; — the colours are
        a best guess, never presented as the original). Your original photo is never altered: you always
        download a new file. Colorize and restore are part of the free tier but are not set up right now —
        the photo enhancer shows their live status.
      </p>
      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        <li className="border-2 border-line bg-white p-5 dark:bg-slate-900">
          <Upload size={22} aria-hidden="true" />
          <h3 className="mt-2 text-lg font-bold">1. Upload your photo</h3>
          <p className="mt-1 text-muted-fg dark:text-slate-300">JPG, PNG, or WebP up to 10 MB. Pick Enhance, Colorize, or Restore + Colorize.</p>
        </li>
        <li className="border-2 border-line bg-white p-5 dark:bg-slate-900">
          <Wand2 size={22} aria-hidden="true" />
          <h3 className="mt-2 text-lg font-bold">2. AI restores it</h3>
          <p className="mt-1 text-muted-fg dark:text-slate-300">Enhance runs right away; colorize and restore run on the server once it is set up. Watch real progress, cancel anytime.</p>
        </li>
        <li className="border-2 border-line bg-white p-5 dark:bg-slate-900">
          <Download size={22} aria-hidden="true" />
          <h3 className="mt-2 text-lg font-bold">3. Compare and download</h3>
          <p className="mt-1 text-muted-fg dark:text-slate-300">Drag the before/after slider, then download as PNG, JPG, or WebP. Try a different colour style without re-uploading.</p>
        </li>
      </ol>
      <p className="mt-4">
        <Link href="/photo-enhancer" className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand-dark bg-brand-dark px-4 font-semibold text-white">
          Open the photo enhancer
        </Link>
      </p>
    </section>
  );
}
