import { NextResponse } from "next/server";
import { getSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Deletes the caller's own account and data, then the client signs out.
// Cascade rules in schema.prisma remove subscriptions, payments and notes
// about the user; jobs are set to null user; authored notes and audit rows
// about them are deleted explicitly.
// HONEST LIMIT: this deletes the Prisma row with the anon key. Deleting
// the Supabase Auth identity itself needs the service-role key or a
// Supabase dashboard deletion (the anon key cannot delete auth users),
// so the owner deletes the auth user in the Supabase dashboard on request.
// No service-role key is introduced for this: the dashboard step is the
// documented, least-privilege path (see COMPLIANCE_CHECKLIST.md).
export async function POST() {
  const session = await getSessionSafe().catch(() => null);
  const userId = session?.user?.id;
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
