import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, auditAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { session, error } = await requireAdmin(req, ["SUPER"]);
  if (error) return error;
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const parsed = z.object({
    category: z.string().trim().min(1).max(80),
    vendor: z.string().trim().min(1).max(120),
    amount: z.number().int().min(0),
    currency: z.string().trim().min(1).max(10),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().trim().max(500).optional(),
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid expense." }, { status: 400 });
  try {
    const row = await prisma.expense.create({
      data: { ...parsed.data, date: new Date(`${parsed.data.date}T00:00:00Z`), createdBy: session.id },
    });
    await auditAdmin(req, session.id, "expense.create", "expense", row.id);
  } catch {
    return NextResponse.json({ error: "Could not save expense." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
