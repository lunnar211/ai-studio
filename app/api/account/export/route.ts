import { NextResponse } from "next/server";
import { getSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Exports the caller's own data only: user row + jobs + subscriptions +
// payments. Never another user's rows (userId always comes from the session).
export async function GET() {
  const session = await getSessionSafe().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const [user, jobs, subscriptions, payments] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.job.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.subscription.findMany({ where: { userId } }),
    prisma.payment.findMany({ where: { userId } }),
  ]);
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  // Never export the encrypted TOTP secret.
  const safeUser = {
    id: user.id, supabaseId: user.supabaseId, email: user.email, name: user.name, image: user.image,
    role: user.role, adminRole: user.adminRole, plan: user.plan, status: user.status,
    country: user.country, dateOfBirth: user.dateOfBirth, ageConfirmed: user.ageConfirmed,
    ageConfirmedAt: user.ageConfirmedAt, termsAcceptedAt: user.termsAcceptedAt,
    totpEnabled: user.totpEnabled, createdAt: user.createdAt, updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
  return NextResponse.json(
    { exportedAt: new Date().toISOString(), user: safeUser, jobs, subscriptions, payments },
    { headers: { "Content-Disposition": 'attachment; filename="ai-studio-my-data.json"' } }
  );
}
