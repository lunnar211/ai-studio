import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { encryptTotpSecret, otpauthUrl, randomTotpSecret } from "@/lib/totp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Generates (or reuses) the admin's TOTP secret and returns a QR code.
// The secret is stored AES-256-GCM-encrypted; totpEnabled stays false until
// a code is verified on /api/admin/verify-2fa. skipTotp: setup must be
// reachable BEFORE the admin has a valid second factor.
export async function POST(req: Request) {
  const { session, error } = await requireAdmin(req, ["SUPER", "SUPPORT", "FINANCE"], { skipTotp: true });
  if (error) return error;
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user?.email) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (user.totpEnabled) return NextResponse.json({ enabled: true });
  const secret = randomTotpSecret();
  await prisma.user.update({ where: { id: session.id }, data: { totpSecretEncrypted: encryptTotpSecret(secret) } });
  const url = otpauthUrl(secret, user.email);
  const qr = await QRCode.toDataURL(url);
  return NextResponse.json({ enabled: false, secret, otpauthUrl: url, qr });
}

export async function GET(req: Request) {
  const { session, error } = await requireAdmin(req, ["SUPER", "SUPPORT", "FINANCE"], { skipTotp: true });
  if (error) return error;
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  return NextResponse.json({ enabled: Boolean(user?.totpEnabled), hasSecret: Boolean(user?.totpSecretEncrypted) });
}
