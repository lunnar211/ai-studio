import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";
import { startOfDay, startOfWeek, startOfMonth } from "@/lib/settings";
import { ExpenseForm } from "../AdminForms";

export const dynamic = "force-dynamic";

// All money figures are labelled estimates where they are estimates: AI
// costs come from SiteSetting cost rates per job, Paddle fees use the
// published 5% + $0.50 per transaction, and payouts are manual records.
// Nothing here is a bill or a tax filing.
export default async function AdminMoney() {
  await requireAdminPage(["SUPER", "FINANCE"]);
  if (!prisma) return <p>Database not configured.</p>;
  const [payments, subs, expenses, jobs] = await Promise.all([
    prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { user: true } }),
    prisma.subscription.groupBy({ by: ["status"], _count: true }),
    prisma.expense.findMany({ orderBy: { date: "desc" }, take: 200 }),
    prisma.job.groupBy({ by: ["tool"], _sum: { costEstimate: true }, _count: true }),
  ]);
  const sum = (list: typeof payments, from?: Date) =>
    list.filter((p) => !from || p.createdAt >= from).reduce((a, p) => a + p.amount, 0);
  const total = sum(payments);
  const today = sum(payments, startOfDay());
  const week = sum(payments, startOfWeek());
  const month = sum(payments, startOfMonth());
  const expenseTotal = expenses.reduce((a, e) => a + e.amount, 0);
  const aiCost = jobs.reduce((a, j) => a + (j._sum.costEstimate ?? 0), 0);
  // Amounts are minor units; Paddle fee estimate: 5% + 50 minor units per payment.
  const paddleFees = payments.reduce((a, p) => a + Math.round(p.amount * 0.05) + 50, 0);
  const netProfitMinor = total - paddleFees - expenseTotal;
  const fmt = (minor: number, currency = "USD") => `${(minor / 100).toFixed(2)} ${currency}`;
  const refunds = payments.filter((p) => /refund/i.test(p.status));

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Money (amounts in minor units; AI cost and fees are estimates)</h2>
      <section aria-label="Revenue" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {([["Revenue today", today], ["Revenue this week", week], ["Revenue this month", month], ["Revenue total", total]] as const).map(([label, v]) => (
          <div key={label} className="border-2 border-line bg-white p-4 dark:bg-slate-900">
            <p className="text-sm text-muted-fg dark:text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-bold">{fmt(v)}</p>
          </div>
        ))}
      </section>
      <section aria-label="Profit" className="border-2 border-line bg-white p-4 dark:bg-slate-900">
        <h3 className="text-xl font-bold">Profit summary (estimates)</h3>
        <p className="mt-2">AI cost (estimated from per-job rates): ${aiCost.toFixed(2)}</p>
        <p>Paddle fees (estimated 5% + $0.50 per transaction): {fmt(paddleFees)}</p>
        <p>Recorded expenses: {fmt(expenseTotal)}</p>
        <p className="font-semibold">Net profit estimate (revenue − fees − expenses; AI cost is an operating estimate shown separately): {fmt(netProfitMinor)}</p>
        <p className="mt-2">Subscriptions by status: {subs.map((s) => `${s.status}: ${s._count}`).join(" · ") || "none"}</p>
        <p className="mt-2">AI cost per tool (estimate): {jobs.map((j) => `${j.tool}: $${(j._sum.costEstimate ?? 0).toFixed(2)} (${j._count} jobs)`).join(" · ") || "no jobs"}</p>
      </section>
      <section aria-label="Payments">
        <h3 className="text-xl font-bold">Per-client payment history (latest 200)</h3>
        <div className="mt-2 flex gap-2">
          <a href="/api/admin/export?type=payments" className="inline-flex min-h-[44px] items-center border-2 border-line bg-white px-4 font-semibold dark:bg-slate-900">Export payments CSV</a>
          <a href="/api/admin/export?type=expenses" className="inline-flex min-h-[44px] items-center border-2 border-line bg-white px-4 font-semibold dark:bg-slate-900">Export expenses CSV</a>
          <Link href="/admin/money/report" className="inline-flex min-h-[44px] items-center border-2 border-line bg-white px-4 font-semibold dark:bg-slate-900">Printable report</Link>
        </div>
        {payments.length === 0 ? <p className="mt-2 text-muted-fg dark:text-slate-300">No payments yet.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[720px] border-2 border-line bg-white text-left dark:bg-slate-900">
              <thead><tr className="border-b-2 border-line"><th className="p-2">Client</th><th className="p-2">Amount</th><th className="p-2">Status</th><th className="p-2">Transaction</th><th className="p-2">Date</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-line">
                    <td className="p-2 break-all">{p.user.email}</td><td className="p-2">{fmt(p.amount, p.currency)}</td>
                    <td className="p-2">{p.status}</td><td className="p-2 break-all">{p.transactionId}</td>
                    <td className="p-2">{p.createdAt.toISOString().slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section aria-label="Refunds">
        <h3 className="text-xl font-bold">Refunds</h3>
        {refunds.length === 0 ? <p className="mt-2 text-muted-fg dark:text-slate-300">No refunds recorded. Note: Paddle does not refund its fee on refunds (see /refund-policy).</p> : (
          <ul className="mt-2 space-y-2">{refunds.map((p) => <li key={p.id} className="border-2 border-line bg-white p-3 dark:bg-slate-900">{p.user.email} · {fmt(p.amount, p.currency)} · {p.status}</li>)}</ul>
        )}
      </section>
      <section aria-label="Expenses">
        <h3 className="text-xl font-bold">Expenses (manual records, incl. payouts recorded as category &ldquo;payout&rdquo;)</h3>
        <div className="mt-2"><ExpenseForm /></div>
        {expenses.length === 0 ? <p className="mt-2 text-muted-fg dark:text-slate-300">No expenses recorded yet.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-2 border-line bg-white text-left dark:bg-slate-900">
              <thead><tr className="border-b-2 border-line"><th className="p-2">Date</th><th className="p-2">Category</th><th className="p-2">Vendor</th><th className="p-2">Amount</th><th className="p-2">Note</th></tr></thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-line">
                    <td className="p-2">{e.date.toISOString().slice(0, 10)}</td><td className="p-2">{e.category}</td>
                    <td className="p-2">{e.vendor}</td><td className="p-2">{fmt(e.amount, e.currency)}</td><td className="p-2">{e.note || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
