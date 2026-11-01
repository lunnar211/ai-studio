import type { Metadata } from "next";
export const metadata: Metadata = { title: "Privacy Policy", description: "How AI Studio handles your uploads, prompts, account data and payments." };
export default function Privacy() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-4xl font-bold italic">Privacy Policy</h1>
      <p className="text-muted-fg dark:text-slate-300">Last updated: November 2026. This page describes what actually happens on this site. It is not legal advice.</p>
      <h2 className="text-2xl font-bold">What we collect</h2>
      <ul className="list-disc space-y-2 pl-6 text-muted-fg dark:text-slate-300">
        <li><strong>Guest tool use:</strong> logo prompts and uploaded images are processed to produce your result and then deleted immediately after processing (max 60 minutes in any case). We never list, share, sell or train models on them. For rate limiting (5 requests per minute per guest visitor) we store a count against your IP address, not a profile of you. Browser colorize is the exception: the photo never leaves your device, so no server copy exists at all.</li>
        <li><strong>Accounts (Google sign-in only):</strong> name, email address and profile picture from Google (minimal scopes: openid, email, profile). If you complete age confirmation, your date of birth and confirmation timestamps. Job history (tool, success/failure, cost estimate) for usage display and Premium photo-budget accounting.</li>
        <li><strong>Admin and safety data:</strong> hashed IP addresses only (SHA-256 HMAC with a server secret) — raw IPs are never stored. Blocked-prompt categories (never prompt text) and error codes for abuse review.</li>
        <li><strong>Payments:</strong> handled by Paddle (merchant of record). We store only customer id, plan, status and invoice/transaction ids. Card details never touch this site.</li>
      </ul>
      <h2 className="text-2xl font-bold">Third parties that actually receive data</h2>
      <ul className="list-disc space-y-2 pl-6 text-muted-fg dark:text-slate-300">
        <li><strong>Google OAuth:</strong> sign-in only, under Google&apos;s policies.</li>
        <li><strong>Groq:</strong> receives logo prompts and briefs (fast text + SVG generation) and voice recordings for transcription (Whisper). First provider tried for text; OpenRouter and Gemini are fallbacks.</li>
        <li><strong>OpenRouter:</strong> receives logo prompts as a text fallback and for extra logo-candidate diversity.</li>
        <li><strong>Gemini:</strong> receives images/prompts for vision analysis and quality judging when configured.</li>
        <li><strong>NVIDIA:</strong> receives images/prompts for vision analysis and text for safety moderation when configured. NVIDIA has no image model on this site.</li>
        <li><strong>ElevenLabs:</strong> receives text only if a voice feature is used (none is forced into the current tools); its adapter is ready for future voice features.</li>
        <li><strong>Replicate:</strong> receives uploaded images when AI colorize or AI upscaling runs (DDColor, Real-ESRGAN). Replicate&apos;s own policy (April 1, 2026) states no fixed deletion period — data is kept as long as necessary to provide the service, plus legal/abuse retention and limited backup copies. See <a href="https://replicate.com/privacy" className="underline">replicate.com/privacy</a>. We make no deletion claim beyond what that policy states.</li>
        <li><strong>Your own Hugging Face Space:</strong> receives uploaded images for server colorize when you (the site owner) have configured a private Space. The Space is yours; its traffic follows Hugging Face&apos;s terms.</li>
        <li><strong>Local Sharp pipeline:</strong> runs on our server; no third party receives the image.</li>
        <li><strong>Browser colorize:</strong> no third party receives the photo — the DeOldify model file (~25 MB) downloads to your device and inference runs locally.</li>
        <li><strong>Paddle:</strong> receives checkout and subscription data as merchant of record.</li>
        <li><strong>Vercel:</strong> hosting (and analytics if enabled). <strong>Upstash:</strong> distributed rate limiting, only if configured.</li>
        <li><strong>Cloudflare Turnstile:</strong> bot protection, only if configured.</li>
        <li><strong>Google AdSense:</strong> only if approved and enabled, and only after you accept the cookie banner. Ads never appear on sign-in, admin, account or empty pages.</li>
      </ul>
      <h2 className="text-2xl font-bold">AI disclosure</h2>
      <p className="text-muted-fg dark:text-slate-300">Logos are AI-generated (Groq first, with OpenRouter and Gemini as fallbacks) and labelled as such in the tool. Enhanced photos are labelled AI or standard quality honestly, and colorized photos always carry the note that colours are estimated. Uploads and prompts sent to providers are processed for your request; we do not use them to train models. What each provider does with API data is governed by that provider&apos;s own policy.</p>
      <h2 className="text-2xl font-bold">Your rights</h2>
      <p className="text-muted-fg dark:text-slate-300">
        Signed-in users can export their data (user row, jobs, subscriptions, payments) and delete
        their account and data from /account at any time. Because guest uploads are deleted after
        processing, there is normally nothing to delete for guests. These rights are offered in the
        style of GDPR/CCPA access and deletion, and consistently with Nepal&apos;s Privacy Act 2018
        and Electronic Transactions Act. For anything else, use the Contact page.
      </p>
      <h2 className="text-2xl font-bold">Retention</h2>
      <p className="text-muted-fg dark:text-slate-300">Job rows older than 90 days are deleted. Uploads are deleted after processing. Support messages are kept until an admin closes them and they are removed in a later cleanup.</p>
      <h2 className="text-2xl font-bold">Children</h2>
      <p className="text-muted-fg dark:text-slate-300">Accounts are not available under age 13 (no data kept), cannot be activated at 13–15, are free-only at 16–17, and may use paid plans only at 18+. See /terms.</p>
    </div>
  );
}
