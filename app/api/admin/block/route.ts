import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, auditAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { hashIp } from "@/lib/ip-hash";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { session, error } = await requireAdmin(req, ["SUPER"]);
  if (error) return error;
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const body = await req.json().catch(() => null);
  const unblock = z.object({ unblockId: z.string() }).safeParse(body);
  if (unblock.success) {
    await prisma.blockedIp.delete({ where: { id: unblock.data.unblockId } }).catch(() => null);
    await auditAdmin(req, session.id, "ip.unblock", "blockedIp", unblock.data.unblockId);
    return NextResponse.json({ ok: true });
  }
  const parsed = z.object({ ip: z.string().trim().min(3).max(60), reason: z.string().trim().max(300).optional() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid IP." }, { status: 400 });
  try {
    await prisma.blockedIp.upsert({
      where: { ipHash: hashIp(parsed.data.ip) },
      update: { reason: parsed.data.reason, blockedBy: session.id },
      create: { ipHash: hashIp(parsed.data.ip), reason: parsed.data.reason, blockedBy: session.id },
    });
    await auditAdmin(req, session.id, "ip.block", "blockedIp", hashIp(parsed.data.ip).slice(0, 12));
  } catch {
    return NextResponse.json({ error: "Could not block IP." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
