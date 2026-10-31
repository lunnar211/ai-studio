import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";
import { startOfDay, startOfWeek, startOfMonth, getSettings } from "@/lib/settings";

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-28 shrink-0 truncate">{label}</span>
      <span className="h-4 flex-1 border border-line bg-slate-100 dark:bg-slate-800" aria-hidden="true">
        <span className="block h-full bg-brand" style={{ width: `${w}%` }} />
      </span>
      <span className="w-12 text-right font-semibold">{value}</span>
    </div>
  );
}

export default async function AdminDashboard() {
  const me = await requireAdminPage(["SUPER", "SUPPORT", "FINANCE"]);
  if (!prisma) {
    return <p className="text-muted-fg dark:text-slate-300">Admin is not configured yet: add DATABASE_URL (see README) to enable the panel.</p>;
  }
  const [totalUsers, todayUsers, weekUsers, monthUsers, jobs, failedJobs, errors, settings] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: startOfDay() } } }),
    prisma.user.count({ where: { createdAt: { gte: startOfWeek() } } }),
    prisma.user.count({ where: { createdAt: { gte: startOfMonth() } } }),
    prisma.job.groupBy({ by: ["tool"], _count: true }),
    prisma.job.count({ where: { status: "FAILED" } }),
    prisma.errorLog.count(),
    getSettings(),
  ]);
  const activeUsers = await prisma.user.count({ where: { lastLoginAt: { gte: startOfWeek() } } });
  const byTool = Object.fromEntries(jobs.map((j) => [j.tool, j._count]));
  const maxTool = Math.max(1, ...(Object.values(byTool) as number[]));
  const budget = parseFloat(settings.apiBudgetUsd) || 0;
  const trailing = new Date();
  trailing.setDate(trailing.getDate() - 30);
  const costAgg = await prisma.job.aggregate({
    where: { createdAt: { gte: trailing } },
    _sum: { costEstimate: true },
  });
  const cost30 = costAgg._sum.costEstimate ?? 0;

  const cards: Array<[string, string]> = [
    ["Total users", String(totalUsers)],
    ["New today / week / month", `${todayUsers} / ${weekUsers} / ${monthUsers}`],
    ["Active this week", String(activeUsers)],
    ["Failed jobs (all time)", String(failedJobs)],
    ["Server errors logged", String(errors)],
    ["AI cost, trailing 30 days (estimate)", `$${cost30.toFixed(2)} / budget $${budget.toFixed(2)}`],
  ];
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-fg dark:text-slate-400">Signed in as admin ({me.adminRole}).</p>
      {budget > 0 && cost30 > budget && (
        <p role="alert" className="border-2 border-destructive bg-red-50 p-4 font-semibold dark:bg-red-950">
          Budget alert: trailing-30-day AI costs (${cost30.toFixed(2)}) exceed the configured budget (${budget.toFixed(2)}).
        </p>
      )}
      <section aria-label="Overview" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value]) => (
          <div key={label} className="border-2 border-line bg-white p-4 dark:bg-slate-900">
            <p className="text-sm text-muted-fg dark:text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </section>
      <section aria-label="Usage per tool" className="border-2 border-line bg-white p-4 dark:bg-slate-900">
        <h2 className="text-xl font-bold">Usage per tool (all time, simple chart)</h2>
        <div className="mt-3 space-y-2">
          {Object.keys(byTool).length === 0 && <p className="text-muted-fg dark:text-slate-300">No jobs recorded yet.</p>}
          {Object.entries(byTool).map(([tool, n]) => (
            <Bar key={tool} label={tool} value={n as number} max={maxTool} />
          ))}
        </div>
      </section>
    </div>
  );
}
