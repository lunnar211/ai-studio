import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Deletes the caller's own account and data, then the client signs out.
// Cascade rules in schema.prisma remove accounts, sessions, subscriptions,
// payments and notes about the user; jobs are set to null user; authored
// notes and audit rows about them are deleted explicitly.
export async function POST() {
  const session = await auth().catch(() => null);
  const userId = (session?.user as unknown as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  try {
    await prisma.adminNote.deleteMany({ where: { authorId: userId } });
    await prisma.auditLog.deleteMany({ where: { actorId: userId } });
    await prisma.user.delete({ where: { id: userId } });
  } catch {
    return NextResponse.json({ error: "Delete failed. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
