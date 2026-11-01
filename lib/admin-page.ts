import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionSafe } from "./auth";
import { TOTP_COOKIE, verifyTotpCookie } from "./totp-cookie";

// Server-side admin gate for /admin pages (middleware gates session
// presence first; this is the authoritative second layer, and it also
// supplies the typed session to pages). TOTP is checked HERE on every
// page — not just client-side, and not in middleware (middleware cannot
// bind the TOTP cookie to a Prisma user id without a database call).
// setup-2fa / verify-2fa pass { skipTotp: true } so an admin can enroll
// or verify before holding a valid second factor.
export async function requireAdminPage(
  allowed: ("SUPER" | "SUPPORT" | "FINANCE")[],
  opts?: { skipTotp?: boolean }
) {
  const session = await getSessionSafe();
  const user = session?.user;
  if (!user?.id || user.role !== "ADMIN" || !user.adminRole) redirect("/signin");
  if (user.status === "SUSPENDED") redirect("/signin");
  if (!allowed.includes(user.adminRole as "SUPER" | "SUPPORT" | "FINANCE")) redirect("/admin");
  if (!opts?.skipTotp) {
    const jar = await cookies();
    const ok = await verifyTotpCookie(
      jar.get(TOTP_COOKIE)?.value,
      user.id,
      process.env.TOTP_SECRET || ""
    );
    if (!ok) redirect("/admin/verify-2fa");
  }
  return { id: user.id as string, adminRole: user.adminRole as string };
}
