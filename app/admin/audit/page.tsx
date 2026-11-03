import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// SUITE Phase 1: the audit trail as its own panel — every admin action,
// who did it (email, not just an id), what, to whom, when, and why.
// Read-only for all three admin roles; nothing here can edit or delete
// a row (the trail is append-only by construction: no route deletes
// audit rows except user deletion, which removes that user's own rows
// with the deleter's row). No tokens, file bytes, or secrets ever appear
// here — AuditLog rows carry none.
export default async function AdminAudit() {
  await requireAdminPage(["SUPER", "SUPPORT", "FINANCE"]);
  if (!prisma) return <p>Database not configured.</p>;
  const rows = await (async () => {
    try {
      return await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    } catch {
      return null;
    }
  })();
  if (rows === null) return <p>Audit log is not available yet: the database needs one schema update.</p>;
  const ids = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => Boolean(x)))];
  const actors = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } } }) : [];
  const emailOf = (id: string | null) => actors.find((u) => u.id === id)?.email || id || "—";
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Audit trail</h2>
      <p className="text-muted-fg dark:text-slate-300">
        Every admin action, newest first. User-affecting actions carry the reason the
        admin gave; system actions (settings, notes, blocks) carry no reason.
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-fg dark:text-slate-300">No audit rows yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-2 border-line bg-white text-left dark:bg-slate-900">
            <thead>
              <tr className="border-b-2 border-line">
                <th className="p-2">Action</th><th className="p-2">Target</th><th className="p-2">Actor</th><th className="p-2">Reason</th><th className="p-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-line">
                  <td className="p-2">{a.action}</td>
                  <td className="p-2 break-all">{a.targetType || ""} {a.targetId || ""}</td>
                  <td className="p-2 break-all">{emailOf(a.actorId)}</td>
                  <td className="p-2">{a.reason || "—"}</td>
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
