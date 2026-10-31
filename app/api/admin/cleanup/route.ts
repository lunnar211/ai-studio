import { NextResponse } from "next/server";
import { requireAdmin, auditAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Job retention policy: Job rows older than 90 days are deleted.
export async function POST(req: Request) {
  const { session, error } = await requireAdmin(req, ["SUPER"]);
  if (error) return error;
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const res = await prisma.job.deleteMany({ where: { createdAt: { lt: cutoff } } });
  await auditAdmin(req, session.id, "jobs.cleanup", "job", `${res.count} rows`);
  return NextResponse.json({ ok: true, deleted: res.count });
}
