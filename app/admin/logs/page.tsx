import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminLogs() {
  await requireAdminPage(["SUPER", "SUPPORT", "FINANCE"]);
  if (!prisma) return <p>Database not configured.</p>;
  const [audit, errors, webhooks] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.errorLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.webhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Logs</h2>
      <section aria-label="Audit log">
        <h3 className="text-xl font-bold">Audit log (every admin action)</h3>
        {audit.length === 0 ? <p className="mt-2 text-muted-fg dark:text-slate-300">No audit rows yet.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-2 border-line bg-white text-left dark:bg-slate-900">
              <thead><tr className="border-b-2 border-line"><th className="p-2">Action</th><th className="p-2">Target</th><th className="p-2">Actor</th><th className="p-2">Date</th></tr></thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-b border-line">
                    <td className="p-2">{a.action}</td><td className="p-2 break-all">{a.targetType || ""} {a.targetId || ""}</td>
                    <td className="p-2 break-all">{a.actorId || "—"}</td><td className="p-2">{a.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section aria-label="Error log">
        <h3 className="text-xl font-bold">Error log</h3>
        {errors.length === 0 ? <p className="mt-2 text-muted-fg dark:text-slate-300">No errors logged.</p> : (
          <ul className="mt-2 space-y-2">
            {errors.map((e) => (
              <li key={e.id} className="border-2 border-line bg-white p-3 dark:bg-slate-900">
                {e.source} · {e.message} {e.path ? `· ${e.path}` : ""} · {e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Webhook log">
        <h3 className="text-xl font-bold">Payment webhook log</h3>
        {webhooks.length === 0 ? <p className="mt-2 text-muted-fg dark:text-slate-300">No webhook events yet.</p> : (
          <ul className="mt-2 space-y-2">
            {webhooks.map((w) => (
              <li key={w.id} className="border-2 border-line bg-white p-3 dark:bg-slate-900">
                {w.provider} · {w.eventType} · {w.eventId} · processed: {w.processedAt ? w.processedAt.toISOString().slice(0, 16).replace("T", " ") : "pending/failed"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
