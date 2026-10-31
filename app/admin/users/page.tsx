import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";
import { UserSearch } from "../AdminForms";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; plan?: string; status?: string; page?: string }> }) {
  await requireAdminPage(["SUPER", "SUPPORT", "FINANCE"]);
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const plan = sp.plan || "";
  const status = sp.status || "";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  if (!prisma) return <p>Database not configured.</p>;
  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }];
  if (plan) where.plan = plan;
  if (status) where.status = status;
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.user.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => `/admin/users?q=${encodeURIComponent(q)}&plan=${plan}&status=${status}&page=${p}`;
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Users ({total})</h2>
      <UserSearch defaultValue={q} />
      <form method="get" className="flex flex-wrap gap-2">
        <input type="hidden" name="q" value={q} />
        <label className="flex items-center gap-2">Plan
          <select name="plan" defaultValue={plan} className="min-h-[44px] border-2 border-line bg-white px-2 dark:bg-slate-900">
            <option value="">All</option><option value="FREE">FREE</option><option value="PREMIUM">PREMIUM</option>
          </select>
        </label>
        <label className="flex items-center gap-2">Status
          <select name="status" defaultValue={status} className="min-h-[44px] border-2 border-line bg-white px-2 dark:bg-slate-900">
            <option value="">All</option><option value="ACTIVE">ACTIVE</option><option value="SUSPENDED">SUSPENDED</option>
          </select>
        </label>
        <button type="submit" className="min-h-[44px] border-2 border-line bg-white px-4 font-semibold dark:bg-slate-900">Filter</button>
        <a href="/api/admin/export?type=users" className="inline-flex min-h-[44px] items-center border-2 border-line bg-white px-4 font-semibold dark:bg-slate-900">Export CSV</a>
      </form>
      {users.length === 0 ? (
        <p className="border-2 border-line bg-white p-4 dark:bg-slate-900">No users match this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-2 border-line bg-white text-left dark:bg-slate-900">
            <thead><tr className="border-b-2 border-line"><th className="p-2">Email</th><th className="p-2">Plan</th><th className="p-2">Role</th><th className="p-2">Status</th><th className="p-2">Joined</th><th className="p-2">View</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line">
                  <td className="p-2 break-all">{u.email}</td><td className="p-2">{u.plan}</td>
                  <td className="p-2">{u.role}{u.adminRole ? `/${u.adminRole}` : ""}</td><td className="p-2">{u.status}</td>
                  <td className="p-2">{u.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="p-2"><Link className="underline" href={`/admin/users/${u.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm">Page {page} of {pages} · {page > 1 && <Link className="underline" href={qs(page - 1)}>Previous</Link>} {page < pages && <Link className="underline" href={qs(page + 1)}>Next</Link>}</p>
    </div>
  );
}
