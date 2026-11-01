import type { Metadata } from "next";
import { LIMITS } from "@/lib/limits";
export const metadata: Metadata = { title: "Terms of Service", description: "Terms for using AI Studio's logo generator and photo enhancer." };
export default function Terms() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-4xl font-bold italic">Terms of Service</h1>
      <p className="text-muted-fg dark:text-slate-300">Last updated: November 2026. By using AI Studio you accept these terms.</p>
      <h2 className="text-2xl font-bold">The service</h2>
      <p className="text-muted-fg dark:text-slate-300">AI Studio provides an AI logo generator and a photo enhancer. Guest use is free within daily limits ({LIMITS.logoRequestsFree} logo requests and {LIMITS.photoCreditsFree} photo credits per day per visitor). Signing in keeps the same free limits and adds history and account features; Premium raises them to {LIMITS.logoRequestsPremium} logo requests and {LIMITS.photoCreditsPremium} photo credits per day. We may change limits, suspend abusive accounts, or discontinue a tool with notice on the site.</p>
      <h2 className="text-2xl font-bold">Age rules (self-declaration, no ID documents)</h2>
      <ul className="list-disc space-y-2 pl-6 text-muted-fg dark:text-slate-300">
        <li>Under 13: no account. The account is deleted/blocked and no data is kept (COPPA and the GDPR-K lower bound).</li>
        <li>Age 13–15: an account cannot be activated.</li>
        <li>Age 16–17: free account only; paid checkout is blocked (16 is the GDPR default digital-consent age and the strictest common standard; Nepal&apos;s Privacy Act 2018 sets no fixed digital-consent age, so 16 is the conservative alignment).</li>
        <li>Age 18+: paid plans are available (contractual capacity).</li>
      </ul>
      <p className="text-muted-fg dark:text-slate-300">By confirming your age you declare it is correct. Providing a false age may lead to account deletion.</p>
      <h2 className="text-2xl font-bold">Your content and outputs</h2>
      <p className="text-muted-fg dark:text-slate-300">You keep rights in your prompts and uploads. Generated logos are original geometry produced from your description; they are yours to use for your business and marketing. For trademark registration, get independent legal advice. You must not use outputs to infringe trademarks, copy existing logos, or mislead anyone into thinking an AI output is a real brand&apos;s mark. See /acceptable-use.</p>
      <h2 className="text-2xl font-bold">Accounts and payments</h2>
      <p className="text-muted-fg dark:text-slate-300">Sign-in is Google-only. You are responsible for your Google account&apos;s security. Premium subscriptions are sold by Paddle as merchant of record; Paddle&apos;s checkout terms apply to payment, and our /refund-policy applies to refunds. We never see or store your card details.</p>
      <h2 className="text-2xl font-bold">Acceptable use and suspension</h2>
      <p className="text-muted-fg dark:text-slate-300">Illegal, abusive, sexual or trademark-copying prompts and uploads are refused or may lead to suspension. See /acceptable-use and /dmca for takedown notices.</p>
      <h2 className="text-2xl font-bold">No warranties</h2>
      <p className="text-muted-fg dark:text-slate-300">Tools are provided as-is. AI outputs may be imperfect; check any logo or photo before commercial use. We are not liable for indirect losses. Nothing here is legal, tax or trademark advice.</p>
    </div>
  );
}
