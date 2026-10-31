import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, auditAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, error } = await requireAdmin(req, ["SUPER", "SUPPORT"]);
  if (error) return error;
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const parsed = z.object({
    reply: z.string().trim().max(5000).optional(),
    status: z.enum(["OPEN", "REPLIED", "CLOSED"]).optional(),
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    await prisma.supportMessage.update({
      where: { id },
      data: {
        ...(parsed.data.reply !== undefined ? { reply: parsed.data.reply, repliedBy: session.id } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      },
    });
    await auditAdmin(req, session.id, "support.reply", "supportMessage", id);
  } catch {
    return NextResponse.json({ error: "Could not save reply." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
