import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireAdmin, auditAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { decryptTotpSecret, verifyTotp } from "@/lib/totp";
import { signTotpCookie, TOTP_COOKIE } from "@/lib/totp-cookie";

export const dynamic = "force-dynamic";

// Verifies a TOTP code. On success: enables TOTP if it was only set up,
// and sets the signed 12-hour second-factor cookie that middleware and the
// admin API guard accept.
export async function POST(req: Request) {
  const { session, error } = await requireAdmin(req, ["SUPER", "SUPPORT", "FINANCE"], { skipTotp: true });
  if (error) return error;
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const parsed = z.object({ code: z.string().regex(/^\d{6}$/) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user?.totpSecretEncrypted) {
    return NextResponse.json({ error: "Two-factor is not set up yet. Visit setup first." }, { status: 400 });
  }
  let secret: string;
  try {
    secret = decryptTotpSecret(user.totpSecretEncrypted);
  } catch {
    return NextResponse.json({ error: "Two-factor secret could not be read. Re-run setup." }, { status: 500 });
  }
  if (!verifyTotp(secret, parsed.data.code)) {
    return NextResponse.json({ error: "That code is not valid. Please try again." }, { status: 400 });
  }
  if (!user.totpEnabled) {
    await prisma.user.update({ where: { id: session.id }, data: { totpEnabled: true } });
  }
  const jar = await cookies();
  jar.set(TOTP_COOKIE, await signTotpCookie(session.id, process.env.AUTH_SECRET || ""), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  await auditAdmin(req, session.id, "totp.verified", "user", session.id);
  return NextResponse.json({ ok: true });
}
