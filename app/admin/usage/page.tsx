import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";
import { BlockForm, CleanupButton } from "../AdminForms";

export const dynamic = "force-dynamic";

// Abuse review shows metadata only: blocked-prompt category + error codes.
// Uploaded image contents are never stored and never shown here.
export default async function AdminUsage() {
  await requireAdminPage(["SUPER", "SUPPORT", "FINANCE"]);
  if (!prisma) return <p>Database not configured.</p>;
  const [topUsers, flagged, failed, blocked] = await Promise.all([
    prisma.job.groupBy({ by: ["userId"], _count: true, orderBy: { _count: { userId: "desc" } }, take: 25 }),
    prisma.job.findMany({ where: { inputSummary: { startsWith: "blocked:" } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.job.findMany({ where: { status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.blockedIp.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const userIds = topUsers.map((u) => u.userId).filter((x): x is string => Boolean(x));
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } } })
    : [];
  const emailOf = (id: string | null) => users.find((u) => u.id === id)?.email || "(guest / deleted)";
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Usage &amp; abuse</h2>
      <section aria-label="Top users">
        <h3 className="text-xl font-bold">Top users by job count</h3>
        {topUsers.length === 0 ? <p className="mt-2 text-muted-fg dark:text-slate-300">No jobs recorded yet.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] border-2 border-line bg-white text-left dark:bg-slate-900">
              <thead><tr className="border-b-2 border-line"><th className="p-2">User</th><th className="p-2">Jobs</th></tr></thead>
              <tbody>
                {topUsers.map((u) => (
                  <tr key={u.userId ?? "guest"} className="border-b border-line">
                    <td className="p-2 break-all">{emailOf(u.userId)}</td><td className="p-2">{u._count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section aria-label="Flagged prompts">
        <h3 className="text-xl font-bold">Flagged prompts (blocklist refusals — category only, prompt text never stored)</h3>
        {flagged.length === 0 ? <p className="mt-2 text-muted-fg dark:text-slate-300">No flagged prompts.</p> : (
          <ul className="mt-2 space-y-2">
            {flagged.map((j) => (
              <li key={j.id} className="border-2 border-line bg-white p-3 dark:bg-slate-900">
                {j.inputSummary} · {j.tool} · {emailOf(j.userId)} · {j.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Failed jobs">
        <h3 className="text-xl font-bold">Failed jobs</h3>
        {failed.length === 0 ? <p className="mt-2 text-muted-fg dark:text-slate-300">No failed jobs.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] border-2 border-line bg-white text-left dark:bg-slate-900">
              <thead><tr className="border-b-2 border-line"><th className="p-2">Tool</th><th className="p-2">Error</th><th className="p-2">User</th><th className="p-2">Date</th></tr></thead>
              <tbody>
                {failed.map((j) => (
                  <tr key={j.id} className="border-b border-line">
                    <td className="p-2">{j.tool}</td><td className="p-2">{j.errorCode || "—"}</td>
                    <td className="p-2 break-all">{emailOf(j.userId)}</td><td className="p-2">{j.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section aria-label="Blocked IPs">
        <h3 className="text-xl font-bold">Blocked IPs (hashes only — raw IPs are never stored)</h3>
        <div className="mt-2"><BlockForm /></div>
        {blocked.length === 0 ? <p className="mt-2 text-muted-fg dark:text-slate-300">No blocked IPs.</p> : (
          <ul className="mt-2 space-y-2">
            {blocked.map((b) => (
              <li key={b.id} className="border-2 border-line bg-white p-3 dark:bg-slate-900">
                <span className="break-all font-mono text-sm">{b.ipHash.slice(0, 24)}…</span>
                {b.reason ? ` · ${b.reason}` : ""} · {b.createdAt.toISOString().slice(0, 10)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-muted-fg dark:text-slate-400">
          Blocked IPs are enforced in both tool routes (logo + enhancer) by hash lookup
          before rate limiting. Other abuse controls: rate limits, quotas, prompt blocklist.
        </p>
      </section>
      <CleanupButton />
      <p className="text-sm text-muted-fg dark:text-slate-400">
        Rate limits and daily quotas are edited on <a className="underline" href="/admin/settings">Settings</a>.
      </p>
    </div>
  );
}
