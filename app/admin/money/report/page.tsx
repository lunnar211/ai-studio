import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "../../AdminForms";

export const dynamic = "force-dynamic";

// Printable report: use the browser's Print → Save as PDF. Figures are
// estimates where labelled; this page is not a tax document.
export default async function MoneyReport() {
  await requireAdminPage(["SUPER", "FINANCE"]);
  if (!prisma) return <p>Database not configured.</p>;
  const [payments, expenses] = await Promise.all([
    prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.expense.findMany({ orderBy: { date: "desc" }, take: 500 }),
  ]);
  const total = payments.reduce((a, p) => a + p.amount, 0);
  const expenseTotal = expenses.reduce((a, e) => a + e.amount, 0);
  const fmt = (minor: number) => `$${(minor / 100).toFixed(2)}`;
  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold">AI Studio — Money report</h2>
      <p className="mt-1 text-sm text-muted-fg">Generated {new Date().toISOString().slice(0, 10)}. Estimates only; not a tax document.</p>
      <PrintButton />
      <div className="mt-4 space-y-2 border-2 border-line bg-white p-4">
        <p>Total recorded revenue: {fmt(total)} ({payments.length} payments)</p>
        <p>Total recorded expenses: {fmt(expenseTotal)} ({expenses.length} expenses)</p>
        <p className="font-semibold">Net (revenue − expenses, before Paddle fees and AI costs): {fmt(total - expenseTotal)}</p>
      </div>
    </div>
  );
}
