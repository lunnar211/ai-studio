import type { Metadata } from "next";
export const metadata: Metadata = { title: "Refund Policy — AI Studio", description: "How Premium refunds work via Paddle." };
export default function RefundPolicy() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-4xl font-bold italic">Refund Policy</h1>
      <p className="text-muted-fg dark:text-slate-300">Last updated: November 2026.</p>
      <h2 className="text-2xl font-bold">How refunds work</h2>
      <p className="text-muted-fg dark:text-slate-300">Premium is sold by Paddle as merchant of record. To request a refund, contact us via the Contact page within 14 days of the charge with your transaction id (shown on /account). Approved refunds are issued by Paddle to the original payment method; timing depends on your bank or card issuer.</p>
      <h2 className="text-2xl font-bold">Paddle fees are not refunded</h2>
      <p className="text-muted-fg dark:text-slate-300">Paddle does not refund its own fee (5% + $0.50 per transaction) on refunds. If a refund is approved, the refunded amount may therefore be the purchase price minus Paddle&apos;s non-refundable fee, as applied by Paddle.</p>
      <h2 className="text-2xl font-bold">What refunds do not cover</h2>
      <p className="text-muted-fg dark:text-slate-300">Free-tier use is free and has nothing to refund. Refunds are not granted for change of mind after substantial Premium use in the billing period, or for outputs you already downloaded and used commercially — each request is still reviewed on its facts.</p>
      <h2 className="text-2xl font-bold">Cancellations</h2>
      <p className="text-muted-fg dark:text-slate-300">Cancelling stops future billing; Premium stays active until the end of the current period. Cancellation is handled in Paddle&apos;s customer portal or via a support request.</p>
    </div>
  );
}
