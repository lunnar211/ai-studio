import Link from "next/link";
import { SISTER_SITE_URL, LEADSFORCEGEN_URL } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-16 border-t-2 border-line bg-white dark:bg-slate-950">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="font-display text-xl font-bold italic">AI Studio</p>
          <p className="mt-2 text-muted-fg dark:text-slate-300">
            Free AI tools for logos and photos. No account needed for the free tier.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="font-semibold">Tools and pages</p>
          <ul className="mt-2 space-y-1">
            {[
              ["/logo-generator", "Logo Generator"],
              ["/photo-enhancer", "Photo Enhancer"],
              ["/colorize-black-and-white-photo", "Colorize Black-and-White Photos"],
              ["/restore-old-photos", "Restore Old Photos"],
              ["/photo-upscaler", "Photo Upscaler"],
              ["/ai-logo-maker", "AI Logo Maker"],
              ["/pricing", "Pricing"],
              ["/faq", "FAQ"],
              ["/about", "About"],
              ["/contact", "Contact"],
              ["/privacy", "Privacy Policy"],
              ["/admin", "Admin"],
              ["/terms", "Terms of Service"],
              ["/cookies", "Cookie Policy"],
              ["/refund-policy", "Refund Policy"],
              ["/acceptable-use", "Acceptable Use"],
              ["/dmca", "DMCA / Takedown"],
              ["/disclaimer", "Disclaimer"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="inline-flex min-h-[44px] items-center hover:underline">{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Other projects">
          <p className="font-semibold">Our other projects</p>
          <ul className="mt-2 space-y-1">
            <li><Link href={SISTER_SITE_URL} className="inline-flex min-h-[44px] items-center hover:underline">PDF Tools Hub</Link></li>
            <li><Link href={LEADSFORCEGEN_URL} className="inline-flex min-h-[44px] items-center hover:underline">LeadsForceGen</Link></li>
          </ul>
          <p className="mt-3 text-sm text-muted-fg dark:text-slate-400">
            Free tier: unlimited logo requests
            per visitor and unlimited photo enhance, colorize and
            restore via the free routes. Files are processed on our server and deleted immediately after processing
            (max 60 minutes in any case); we never list or share them. Browser colorize never uploads your photo at all.
          </p>
        </nav>
      </div>
      <div className="border-t-2 border-line px-4 py-4 text-center text-sm text-muted-fg">
        © {new Date().getFullYear()} AI Studio. All rights reserved.
      </div>
    </footer>
  );
}
