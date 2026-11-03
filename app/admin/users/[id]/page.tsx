import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";
import { UserActions, NoteForm, CreditForm } from "../../AdminForms";
import { effectivePhotoBudget } from "@/lib/ai/credits";

export const dynamic = "force-dynamic";

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdminPage(["SUPER", "SUPPORT", "FINANCE"]);
  const { id } = await params;
  if (!prisma) return <p>Database not configured.</p>;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();
  const [jobs, notes, payments, subs] = await Promise.all([
    prisma.job.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.adminNote.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, include: { author: true } }),
    prisma.payment.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.subscription.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  // SUITE Phase 1: budget adjustments + effective budget for this client.
  // Status and numbers only — never file bytes. A missing table (schema
  // not pushed) degrades to a pending note instead of breaking the page.
  const budgetInfo = await (async () => {
    try {
      const [adjustments, effective] = await Promise.all([
        prisma.creditAdjustment.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
        user.plan === "PREMIUM" ? effectivePhotoBudget("PREMIUM", id) : null,
      ]);
      const total = adjustments.reduce((s, a) => s + a.amount, 0);
      return { adjustments, total, effective };
    } catch {
      return null;
    }
  })();
  const actors = budgetInfo && budgetInfo.adjustments.length
    ? await prisma.user.findMany({ where: { id: { in: budgetInfo.adjustments.map((a) => a.actorId) } } })
    : [];
  const logoCount = jobs.filter((j) => j.tool === "logo").length;
  const enhanceCount = jobs.filter((j) => j.tool === "enhance").length;
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold break-all">{user.email}</h2>
      <div className="border-2 border-line bg-white p-4 dark:bg-slate-900">
        <p>Name: {user.name || "—"}</p>
        <p>Plan: {user.plan} · Role: {user.role}{user.adminRole ? ` / ${user.adminRole}` : ""} · Status: {user.status}</p>
        <p>Country: {user.country || "—"} · Age confirmed: {user.ageConfirmed ? "yes" : "no"} · 2FA: {user.totpEnabled ? "enabled" : "no"}</p>
        <p>Joined: {user.createdAt.toISOString().slice(0, 10)} · Last login: {user.lastLoginAt?.toISOString().slice(0, 16).replace("T", " ") || "—"}</p>
        <p>Usage (recent 50 jobs): logos {logoCount}, enhancements {enhanceCount}</p>
        <p>Subscriptions: {subs.map((s) => `${s.plan}/${s.status}`).join(", ") || "none"}</p>
        <p>Payments: {payments.map((p) => `${p.amount} ${p.currency} ${p.status}`).join(" · ") || "none"}</p>
      </div>
      {me.adminRole === "SUPER" && <UserActions userId={id} status={user.status} plan={user.plan} role={user.role} adminRole={user.adminRole} />}
      {me.adminRole === "SUPER" && <CreditForm userId={id} />}
      <section aria-label="GPU budget adjustments">
        <h3 className="text-xl font-bold">GPU budget adjustments</h3>
        {budgetInfo === null ? (
          <p className="mt-2 text-muted-fg dark:text-slate-300">
            Adjustments are not available yet: the database needs one schema update
            (the site owner runs one command).
          </p>
        ) : (
          <>
            <p className="mt-2 text-muted-fg dark:text-slate-300">
              Total adjustments: {budgetInfo.total >= 0 ? "+" : ""}{budgetInfo.total} units
              {budgetInfo.effective ? ` · Effective Premium budget: ${budgetInfo.effective.budget} units/day` : " · No Premium GPU budget (FREE plan)"}
            </p>
            {budgetInfo.adjustments.length === 0 ? (
              <p className="mt-2 text-muted-fg dark:text-slate-300">No adjustments recorded.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {budgetInfo.adjustments.map((a) => (
                  <li key={a.id} className="border-2 border-line bg-white p-3 dark:bg-slate-900">
                    <p>{a.amount >= 0 ? "+" : ""}{a.amount} units · {a.reason}</p>
                    <p className="text-sm text-muted-fg dark:text-slate-400">
                      by {actors.find((u) => u.id === a.actorId)?.email || a.actorId} · {a.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      {(me.adminRole === "SUPER" || me.adminRole === "SUPPORT") && <NoteForm userId={id} />}
      <section aria-label="Internal notes">
        <h3 className="text-xl font-bold">Internal notes</h3>
        {notes.length === 0 ? <p className="mt-2 text-muted-fg dark:text-slate-300">No notes yet.</p> : (
          <ul className="mt-2 space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="border-2 border-line bg-white p-3 dark:bg-slate-900">
                <p>{n.note}</p>
                <p className="text-sm text-muted-fg dark:text-slate-400">by {n.author.email} · {n.createdAt.toISOString().slice(0, 16).replace("T", " ")}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Recent jobs">
        <h3 className="text-xl font-bold">Recent jobs</h3>
        {jobs.length === 0 ? <p className="mt-2 text-muted-fg dark:text-slate-300">No jobs yet.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] border-2 border-line bg-white text-left dark:bg-slate-900">
              <thead><tr className="border-b-2 border-line"><th className="p-2">Tool</th><th className="p-2">Status</th><th className="p-2">Date</th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-b border-line">
                    <td className="p-2">{j.tool}</td><td className="p-2">{j.status}{j.errorCode ? ` (${j.errorCode})` : ""}</td>
                    <td className="p-2">{j.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
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
