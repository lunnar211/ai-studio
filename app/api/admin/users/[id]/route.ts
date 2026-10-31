import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, auditAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const Patch = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  plan: z.enum(["FREE", "PREMIUM"]).optional(),
  resetLimits: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, error } = await requireAdmin(req, ["SUPER"]);
  if (error) return error;
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { status, plan, resetLimits } = parsed.data;
  try {
    if (resetLimits) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      await prisma.job.deleteMany({ where: { userId: id, createdAt: { gte: start } } });
      await auditAdmin(req, session.id, "limits.reset", "user", id);
      return NextResponse.json({ ok: true });
    }
    const data: Record<string, string> = {};
    if (status) data.status = status;
    if (plan) data.plan = plan;
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    await prisma.user.update({ where: { id }, data: data as never });
    await auditAdmin(req, session.id, `user.${status ? "status" : "plan"}`, "user", id);
  } catch {
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, error } = await requireAdmin(req, ["SUPER"]);
  if (error) return error;
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (id === session.id) return NextResponse.json({ error: "Admins cannot delete themselves here." }, { status: 400 });
  try {
    await prisma.adminNote.deleteMany({ where: { authorId: id } });
    await prisma.auditLog.deleteMany({ where: { actorId: id } });
    await prisma.user.delete({ where: { id } });
    await auditAdmin(req, session.id, "user.delete", "user", id);
  } catch {
    return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
