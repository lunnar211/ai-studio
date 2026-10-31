import type { Metadata } from "next";
export const metadata: Metadata = { title: "Privacy Policy — AI Studio", description: "How AI Studio handles your uploads, rate-limit data and analytics." };
export default function Privacy() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-4xl font-bold italic">Privacy Policy</h1>
      <p className="text-muted-fg dark:text-slate-300">Last updated: November 2026.</p>
      <h2 className="text-2xl font-bold">What we collect</h2>
      <p className="text-muted-fg dark:text-slate-300">Uploaded images and logo prompts are processed to produce your result and then deleted immediately after processing (max 60 minutes in any case). We never list, share, sell or train models on them. For rate limiting (10 AI generations per day per visitor on the free tier) we store a count against your IP address, not a profile of you. If analytics is enabled, it is aggregated and anonymous; declining the cookie banner keeps analytics off.</p>
      <h2 className="text-2xl font-bold">What we do not collect</h2>
      <p className="text-muted-fg dark:text-slate-300">No account is required for the free tier, so we hold no passwords and no payment details. We never ask for card details on this site.</p>
      <h2 className="text-2xl font-bold">Third parties</h2>
      <p className="text-muted-fg dark:text-slate-300">Logo generation calls the Groq API; photo enhancement may call the Replicate API; bot protection may use Cloudflare Turnstile. Those services receive only the prompt or image needed for the request, under their own privacy policies. Hosting and analytics are provided by Vercel.</p>
      <h2 className="text-2xl font-bold">Your rights</h2>
      <p className="text-muted-fg dark:text-slate-300">Because uploads are deleted after processing, there is normally nothing to delete on request. For anything else, use the Contact page.</p>
    </div>
  );
}
