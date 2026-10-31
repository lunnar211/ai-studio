import Link from "next/link";
import { SISTER_SITE_URL, LEADSFORCEGEN_URL } from "@/lib/site";

export function CrossPromo() {
  return (
    <section aria-labelledby="more-tools-heading" className="mt-12 border-2 border-line bg-white p-6 dark:bg-slate-900">
      <h2 id="more-tools-heading" className="font-display text-2xl font-bold italic">
        More tools you may like
      </h2>
      <p className="mt-2 text-muted-fg dark:text-slate-300">
        Finished here? Try our document tools, or explore the lead-generation app from the same maker.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={SISTER_SITE_URL} className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-accent px-4 py-2 font-semibold text-accent-dark">
          PDF Tools Hub
        </Link>
        <Link href={LEADSFORCEGEN_URL} className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand px-4 py-2 font-semibold text-brand-dark">
          LeadsForceGen
        </Link>
      </div>
    </section>
  );
}
