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
  const parsed = z.object({ note: z.string().trim().min(1).max(2000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Note is required (max 2000 chars)." }, { status: 400 });
  try {
    await prisma.adminNote.create({ data: { userId: id, authorId: session.id, note: parsed.data.note } });
    await auditAdmin(req, session.id, "note.create", "user", id);
  } catch {
    return NextResponse.json({ error: "Could not save note." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
