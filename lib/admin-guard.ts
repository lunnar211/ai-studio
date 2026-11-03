import { NextResponse } from "next/server";
import { getSessionSafe } from "./auth";
import { TOTP_COOKIE, verifyTotpCookie } from "./totp-cookie";
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
  const session = await getSessionSafe().catch(() => null);
  const user = session?.user as unknown as AdminSession & { status?: string } | undefined;
  if (!user?.id || user.role !== "ADMIN" || !user.adminRole) {
    return { session: null, error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  if (user.status === "SUSPENDED") {
    return { session: null, error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  if (!allowed.includes(user.adminRole as "SUPER" | "SUPPORT" | "FINANCE")) {
    return { session: null, error: NextResponse.json({ error: "Forbidden for your admin role." }, { status: 403 }) };
  }
  if (!opts?.skipTotp) {
    // TOTP proof is the signed cookie ONLY (there is no JWT anymore).
    // verifyTotpCookie returns false when TOTP_SECRET is unset, so admin
    // API access fails closed without a configured second-factor secret.
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(new RegExp(`${TOTP_COOKIE}=([^;]+)`));
    const cookieOk = await verifyTotpCookie(match?.[1], user.id, process.env.TOTP_SECRET || "");
    if (!cookieOk) {
      return { session: null, error: NextResponse.json({ error: "Two-factor verification required." }, { status: 403 }) };
    }
  }
  return { session: user as AdminSession, error: null };
}

export async function auditAdmin(
  req: Request,
  actorId: string,
  action: string,
  targetType?: string,
  targetId?: string,
  reason?: string
): Promise<void> {
  await audit({ actorId, action, targetType, targetId, reason, ipHash: hashIp(getClientIp(req)) });
}
