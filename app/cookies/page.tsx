import type { Metadata } from "next";
export const metadata: Metadata = { title: "Cookie Policy", description: "Which cookies AI Studio uses and how consent works." };
export default function CookiesPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-4xl font-bold italic">Cookie Policy</h1>
      <p className="text-muted-fg dark:text-slate-300">Last updated: November 2026.</p>
      <h2 className="text-2xl font-bold">Essential cookies</h2>
      <p className="text-muted-fg dark:text-slate-300">Sign-in session cookies (Auth.js), the admin second-factor cookie (12 hours), and theme preference. These are required for the site to work and cannot be declined while using accounts or admin.</p>
      <h2 className="text-2xl font-bold">Consent-based cookies</h2>
      <p className="text-muted-fg dark:text-slate-300">Analytics and advertising cookies load ONLY after you accept the cookie banner. Declining keeps essentials only: analytics stays off and no ad slot renders. Your choice is stored in your browser (localStorage key ai-studio-cookie-choice); clearing it shows the banner again.</p>
      <h2 className="text-2xl font-bold">What we do not do</h2>
      <p className="text-muted-fg dark:text-slate-300">No ads run before AdSense approval. No ads appear on /signin, /admin, /account or empty pages. No cross-site tracking for advertising is configured by this site itself.</p>
    </div>
  );
}
