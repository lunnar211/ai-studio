import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { CheckoutButton } from "@/app/account/AccountActions";
import { CrossPromo } from "@/components/site/CrossPromo";

export const metadata: Metadata = {
  title: "Pricing — AI Studio",
  description: "AI Studio pricing: free tier with 10 generations per day, and Premium with 100 per day, sold through Paddle. No invented prices — the Premium price is shown at checkout.",
  openGraph: {
    title: "Pricing | AI Studio",
    description: "Free: 10 generations per day. Premium: 100 per day, sold through Paddle.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "AI Studio Pricing",
  description: "Free and Premium plans for AI Studio logo generation and photo enhancement.",
};

export default async function PricingPage() {
  const settings = await getSettings();
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="font-display text-4xl font-bold italic">Pricing</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-fg dark:text-slate-300">
        Start free, no account needed. Upgrade when you need more generations per day.
      </p>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section aria-label="Free plan" className="border-2 border-line bg-white p-6 dark:bg-slate-900">
          <h2 className="text-2xl font-bold">Free</h2>
          <p className="mt-2 text-3xl font-bold">$0</p>
          <ul className="mt-4 list-disc space-y-2 pl-6">
            <li>{settings.logoDailyFree} logo requests per day (each request gives 3 variants)</li>
            <li>{settings.enhanceDailyFree} photo enhancements per day</li>
            <li>SVG and 1024px PNG downloads</li>
            <li>No account, no payment details</li>
          </ul>
          <Link href="/logo-generator" className="mt-6 inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand px-5 py-2.5 font-semibold text-brand">
            Start free
          </Link>
        </section>
        <section aria-label="Premium plan" className="border-2 border-accent bg-white p-6 dark:bg-slate-900">
          <h2 className="text-2xl font-bold">Premium</h2>
          <p className="mt-2 text-lg text-muted-fg dark:text-slate-300">
            Price shown at checkout — it is set in Paddle (the payment provider), not invented here.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-6">
            <li>{settings.logoDailyPremium} logo requests per day (each request gives 3 variants)</li>
            <li>{settings.enhanceDailyPremium} photo enhancements per day</li>
            <li>Saved logo history with favorites</li>
            <li>No ads</li>
            <li>Priority generation</li>
          </ul>
          <div className="mt-6">
            <CheckoutButton />
          </div>
          <p className="mt-3 text-sm text-muted-fg dark:text-slate-400">
            Paid plans require age 18+. If checkout is not configured yet, you will see an honest message, not a charge.
          </p>
        </section>
      </div>
      <p className="mt-6 text-sm text-muted-fg dark:text-slate-400">
        Limits are per visitor (free) or per account (signed in), counted per day. One logo request — 3 variants — uses 1 credit.
        See the <Link href="/faq" className="underline">FAQ</Link> and <Link href="/refund-policy" className="underline">Refund Policy</Link>.
      </p>
      <CrossPromo />
    </div>
  );
}
