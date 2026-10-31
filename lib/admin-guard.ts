import { NextResponse } from "next/server";
import { auth } from "./auth";
import { TOTP_COOKIE, TOTP_WINDOW_MS, verifyTotpCookie } from "./totp-cookie";
import { hashIp } from "./ip-hash";
import { getClientIp } from "./rate-limit";
import { audit } from "./settings";

export type AdminSession = {
  id: string;
  email?: string | null;
  role: string;
  adminRole: string | null;
};

// Defense in depth: every /api/admin/* route calls this, even though
// middleware already gates /admin pages. Roles: SUPER = everything;
// SUPPORT = read users, notes, support inbox, logs (no plan changes,
// deletes, money edits, settings); FINANCE = view-only money + expenses
// view (no edits, no users, no settings).
export async function requireAdmin(
  req: Request,
  allowed: ("SUPER" | "SUPPORT" | "FINANCE")[],
  opts?: { skipTotp?: boolean }
): Promise<{ session: AdminSession; error: null } | { session: null; error: NextResponse }> {
  const session = await auth().catch(() => null);
  const user = session?.user as unknown as AdminSession | undefined;
  if (!user?.id || user.role !== "ADMIN" || !user.adminRole) {
    return { session: null, error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  if (!allowed.includes(user.adminRole as "SUPER" | "SUPPORT" | "FINANCE")) {
    return { session: null, error: NextResponse.json({ error: "Forbidden for your admin role." }, { status: 403 }) };
  }
  if (!opts?.skipTotp) {
    const jwtOk =
      typeof (user as unknown as Record<string, unknown>).totpVerifiedAt === "number" &&
      Date.now() - ((user as unknown as Record<string, unknown>).totpVerifiedAt as number) < TOTP_WINDOW_MS;
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(new RegExp(`${TOTP_COOKIE}=([^;]+)`));
    const cookieOk = await verifyTotpCookie(match?.[1], user.id, process.env.AUTH_SECRET || "");
    if (!jwtOk && !cookieOk) {
      return { session: null, error: NextResponse.json({ error: "Two-factor verification required." }, { status: 403 }) };
    }
  }
  return { session: user, error: null };
}

export async function auditAdmin(
  req: Request,
  actorId: string,
  action: string,
  targetType?: string,
  targetId?: string
): Promise<void> {
  await audit({ actorId, action, targetType, targetId, ipHash: hashIp(getClientIp(req)) });
}
