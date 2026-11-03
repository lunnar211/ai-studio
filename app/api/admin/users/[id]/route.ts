import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, auditAdmin } from "@/lib/admin-guard";
import { normalizeReason } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const Patch = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  plan: z.enum(["FREE", "PREMIUM"]).optional(),
  resetLimits: z.boolean().optional(),
  // Admin role management (SUPER only, see guards below). `adminRole`
  // is meaningful only when role is ADMIN; setting role USER clears it.
  // There is deliberately no "create admin user" here: new auth users
  // are created by the owner in the Supabase dashboard, and this panel
  // manages existing users only.
  role: z.enum(["USER", "ADMIN"]).optional(),
  adminRole: z.enum(["SUPER", "SUPPORT", "FINANCE"]).nullable().optional(),
  // SUITE Phase 1: every user-affecting change requires a human-written
  // reason, recorded on the audit row. A change without a reason is a
  // change nobody can explain later.
  reason: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, error } = await requireAdmin(req, ["SUPER"]);
  if (error) return error;
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { status, plan, resetLimits, role, adminRole } = parsed.data;
  const reason = normalizeReason(parsed.data.reason);
  if (!reason.ok) return NextResponse.json({ error: reason.error }, { status: 400 });
  try {
    if (resetLimits) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      await prisma.job.deleteMany({ where: { userId: id, createdAt: { gte: start } } });
      await auditAdmin(req, session.id, "limits.reset", "user", id, reason.reason);
      return NextResponse.json({ ok: true });
    }
    const data: Record<string, string | null> = {};
    if (status) data.status = status;
    if (plan) data.plan = plan;
    if (role !== undefined || adminRole !== undefined) {
      // No self-demotion lockout: an admin cannot change their own role,
      // so the last SUPER can never remove themselves by accident.
      if (id === session.id) return NextResponse.json({ error: "Admins cannot change their own role here." }, { status: 400 });
      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
      const nextRole = role ?? target.role;
      const nextAdminRole = adminRole !== undefined ? adminRole : target.adminRole;
      if (nextAdminRole !== null && nextRole !== "ADMIN") {
        return NextResponse.json({ error: "An admin role needs the ADMIN role. Set role to ADMIN first." }, { status: 400 });
      }
      if (role !== undefined) data.role = role;
      if (adminRole !== undefined) data.adminRole = adminRole;
      // Dropping to USER clears any admin role, even if the caller only
      // sent role: a USER row must never carry a stale adminRole.
      if (nextRole === "USER") data.adminRole = null;
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    await prisma.user.update({ where: { id }, data: data as never });
    const action = role !== undefined || adminRole !== undefined ? "role" : status ? "status" : "plan";
    await auditAdmin(req, session.id, `user.${action}`, "user", id, reason.reason);
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
  // SUITE Phase 1: deletes take a reason too — a deleted user deserves
  // an explained audit row as much as a suspended one.
  const reason = normalizeReason((await req.json().catch(() => null) as { reason?: unknown } | null)?.reason);
  if (!reason.ok) return NextResponse.json({ error: reason.error }, { status: 400 });
  try {
    await prisma.adminNote.deleteMany({ where: { authorId: id } });
    await prisma.auditLog.deleteMany({ where: { actorId: id } });
    await prisma.user.delete({ where: { id } });
    await auditAdmin(req, session.id, "user.delete", "user", id, reason.reason);
  } catch {
    return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
