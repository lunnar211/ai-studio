import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// SUITE Phase 1: credit adjustments across all clients, newest first
// (SUPER only — adjustments are money-adjacent). Status and numbers
// only: user email, signed amount, reason, acting admin, date. Adjustments
// apply to the Premium paid-GPU budget; free routes are unlimited and
// never touch a budget. A missing table (schema not pushed) shows the
// honest pending note instead of an empty list pretending nothing exists.
export default async function AdminCredits() {
  await requireAdminPage(["SUPER"]);
  if (!prisma) return <p>Database not configured.</p>;
  const rows = await (async () => {
    try {
      return await prisma.creditAdjustment.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    } catch {
      return null;
    }
  })();
  if (rows === null) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Credit adjustments</h2>
        <p className="text-muted-fg dark:text-slate-300">
          Adjustments are not available yet: the database needs one schema update
          (the site owner runs one command). Record adjustments per client from
          their user page once the update is pushed.
        </p>
      </div>
    );
  }
  const ids = [...new Set([...rows.map((r) => r.userId), ...rows.map((r) => r.actorId)])];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } } }) : [];
  const emailOf = (id: string) => users.find((u) => u.id === id)?.email || id;
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Credit adjustments</h2>
      <p className="text-muted-fg dark:text-slate-300">
        Recorded GPU-budget deltas for Premium users. Adjust per client from their
        user page; this page is the cross-client record.
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-fg dark:text-slate-300">No adjustments recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-2 border-line bg-white text-left dark:bg-slate-900">
            <thead>
              <tr className="border-b-2 border-line">
                <th className="p-2">User</th><th className="p-2">Amount</th><th className="p-2">Reason</th><th className="p-2">Actor</th><th className="p-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-line">
                  <td className="p-2 break-all">{emailOf(a.userId)}</td>
                  <td className="p-2">{a.amount >= 0 ? "+" : ""}{a.amount}</td>
                  <td className="p-2">{a.reason}</td>
                  <td className="p-2 break-all">{emailOf(a.actorId)}</td>
                  <td className="p-2">{a.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
