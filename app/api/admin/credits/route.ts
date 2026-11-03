import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, auditAdmin } from "@/lib/admin-guard";
import { normalizeReason, validateCreditAmount } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// SUITE Phase 1: SUPER-only credit adjustment. There is no balance column
// in this codebase (free photos/logos are unlimited; the only budget is
// the Premium paid-GPU fair-use budget), so an adjustment is a recorded
// signed delta: +N grants N extra GPU units, −N removes them. The delta
// is permanent until reversed by another adjustment. The reason is
// mandatory and is stored on the adjustment row AND the audit row.
// No paid AI call happens here — this only records budget.
const Body = z.object({
  userId: z.string().min(1).max(100),
  amount: z.number().int(),
  reason: z.string(),
});

export async function POST(req: Request): Promise<Response> {
  const { session, error } = await requireAdmin(req, ["SUPER"]);
  if (error) return error;
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const amount = validateCreditAmount(parsed.data.amount);
  if (!amount.ok) return NextResponse.json({ error: amount.error }, { status: 400 });
  const reason = normalizeReason(parsed.data.reason);
  if (!reason.ok) return NextResponse.json({ error: reason.error }, { status: 400 });
  try {
    const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
    if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
    const row = await prisma.creditAdjustment.create({
      data: {
        userId: target.id,
        amount: amount.amount,
        reason: reason.reason,
        actorId: session.id,
      },
    });
    await auditAdmin(req, session.id, "credit.adjust", "user", target.id, reason.reason);
    return NextResponse.json({ ok: true, adjustmentId: row.id, amount: row.amount });
  } catch {
    // Missing table (schema not pushed): refuse honestly instead of
    // pretending the adjustment landed. Never leak the raw DB error.
    return NextResponse.json(
      { error: "Credit adjustments need one schema update (the site owner runs one command)." },
      { status: 503 }
    );
  }
}
