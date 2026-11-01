import type { Metadata } from "next";
import Link from "next/link";
import { formatPaddlePrice, getPaddlePriceDisplay, paddleConfigured } from "@/lib/paddle";
import { CheckoutButton } from "@/app/account/AccountActions";

export const metadata: Metadata = {
  title: "Pricing",
  description: "AI Studio pricing: free unlimited photo enhance, colorize and restore via the free routes, and Premium with fast paid-GPU processing, HD export and face enhance, sold through Paddle. The Premium price comes from Paddle, never invented.",
  openGraph: {
    title: "Pricing | AI Studio",
    description: "Free and Premium plans for AI Studio logo generation and photo enhancement.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "AI Studio Pricing",
  description: "Free and Premium plans for AI Studio logo generation and photo enhancement.",
};

export default async function PricingPage() {
  const configured = paddleConfigured();
  const monthly = configured ? await getPaddlePriceDisplay(process.env.PADDLE_PRICE_ID ?? "") : null;
  const yearlyId = process.env.PADDLE_PRICE_ID_YEARLY ?? "";
  const yearly = configured && yearlyId ? await getPaddlePriceDisplay(yearlyId) : null;

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="font-display text-4xl font-bold italic">Pricing</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-fg dark:text-slate-300">
        Start free, no account needed, and use the photo tools as much as
        you like. Signing in keeps the same free photo use — it adds
        history and account features, not more free photo capacity.
        Premium adds speed and quality on the paid-GPU route, not more
        free-route use (free is already unlimited).
      </p>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section aria-label="Free plan" className="border-2 border-line bg-white p-6 dark:bg-slate-900">
          <h2 className="text-2xl font-bold">Free</h2>
          <p className="mt-2 text-3xl font-bold">$0</p>
          <ul className="mt-4 list-disc space-y-2 pl-6">
            <li>Unlimited logo requests (each request gives 3 variants)</li>
            <li>Unlimited photo enhance, colorize and restore via the free routes (browser colorize + free server route + local sharpening), no daily cap, no account needed</li>
            <li>Logo downloads: SVG and 1024px PNG</li>
            <li>Photo downloads: PNG, JPG, or WebP</li>
            <li>Free browser colorize (unlimited, photo stays on your device)</li>
            <li>Upscaling up to 2x / 2048px</li>
            <li>No account, no payment details</li>
          </ul>
          <Link href="/logo-generator" className="mt-6 inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand px-5 py-2.5 font-semibold text-brand-dark">
            Start free
          </Link>
        </section>
        <section aria-label="Premium plan" className="border-2 border-accent bg-white p-6 dark:bg-slate-900">
          <h2 className="text-2xl font-bold">Premium</h2>
          {monthly || yearly ? (
            <div className="mt-2 space-y-1">
              {monthly && <p className="text-3xl font-bold">{formatPaddlePrice(monthly)}</p>}
              {yearly && <p className="text-lg text-muted-fg dark:text-slate-300">Yearly: {formatPaddlePrice(yearly)}</p>}
              <p className="text-sm text-muted-fg dark:text-slate-400">Price from Paddle (merchant of record), shown here exactly as configured.</p>
            </div>
          ) : (
            <p className="mt-2 text-lg text-muted-fg dark:text-slate-300">
              Premium checkout is not configured yet — no Upgrade button is
              shown until a real Paddle price exists. The limits below are
              what Premium will give once checkout is live.
            </p>
          )}
          <ul className="mt-4 list-disc space-y-2 pl-6">
            <li>Fast paid-GPU photo processing (the free routes stay unlimited for everyone)</li>
            <li>HD 4x upscaling up to 4096px longest edge</li>
            <li>Face enhance on upscales</li>
            <li>Priority generation</li>
            <li>Saved logo history with favorites</li>
            <li>No ads</li>
          </ul>
          {configured && monthly && (
            <div className="mt-6">
              <CheckoutButton billing="monthly" label="Upgrade to Premium (monthly) via Paddle" />
            </div>
          )}
          {configured && yearly && (
            <div className="mt-3">
              <CheckoutButton billing="yearly" label="Upgrade to Premium (yearly) via Paddle" />
            </div>
          )}
          <p className="mt-3 text-sm text-muted-fg dark:text-slate-400">
            Paid plans require age 18+. Checkout is handled by Paddle; no card
            details are ever entered on this site.
          </p>
        </section>
      </div>

      <section aria-label="Plan comparison" className="mt-10">
        <h2 className="text-2xl font-bold">Compare plans</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-2 border-line bg-white text-left dark:bg-slate-900">
            <thead>
              <tr className="border-b-2 border-line">
                <th scope="col" className="p-3">Feature</th>
                <th scope="col" className="p-3">Free</th>
                <th scope="col" className="p-3">Premium</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line"><th scope="row" className="p-3 font-medium">Logo requests</th><td className="p-3">Unlimited (3 variants each)</td><td className="p-3">Unlimited (3 variants each)</td></tr>
              <tr className="border-b border-line"><th scope="row" className="p-3 font-medium">Photo enhance / colorize / restore</th><td className="p-3">Unlimited via the free routes</td><td className="p-3">Unlimited free routes + fast paid-GPU route</td></tr>
              <tr className="border-b border-line"><th scope="row" className="p-3 font-medium">HD upscaling</th><td className="p-3">Up to 2x / 2048px</td><td className="p-3">Up to 4x / 4096px</td></tr>
              <tr className="border-b border-line"><th scope="row" className="p-3 font-medium">Face enhance</th><td className="p-3">No</td><td className="p-3">Yes</td></tr>
              <tr className="border-b border-line"><th scope="row" className="p-3 font-medium">Priority generation</th><td className="p-3">No</td><td className="p-3">Yes</td></tr>
              <tr className="border-b border-line"><th scope="row" className="p-3 font-medium">Logo history + favorites</th><td className="p-3">Signed-in free: yes, same limits</td><td className="p-3">Yes</td></tr>
              <tr className="border-b border-line"><th scope="row" className="p-3 font-medium">Ads</th><td className="p-3">Only if approved and consented (never on tools behind sign-in)</td><td className="p-3">No ads</td></tr>
              <tr><th scope="row" className="p-3 font-medium">Downloads</th><td className="p-3">Logos: SVG + PNG 1024. Photos: PNG, JPG, WebP.</td><td className="p-3">Same formats, plus HD 4x photo export.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-6 text-sm text-muted-fg dark:text-slate-400">
        Photo use on the free routes is unlimited (no daily cap), and logo
        requests are unlimited too. Abuse protection limits requests to
        5 per minute per visitor. One logo request gives 3 variants.
        Browser colorize is unlimited.
        Refunds: contact us via
        the <Link href="/contact" className="underline">Contact page</Link> within
        14 days of the charge with your transaction id; approved refunds are
        issued by Paddle to the original payment method, minus Paddle&apos;s
        non-refundable fee (5% + $0.50). Cancelling stops future billing;
        Premium stays active until the end of the current period. Full
        details on the <Link href="/refund-policy" className="underline">Refund Policy</Link> page.
      </p>
    </div>
  );
}
