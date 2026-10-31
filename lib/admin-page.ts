import { redirect } from "next/navigation";
import { getSessionSafe } from "./auth";

// Server-side admin gate for /admin pages (middleware gates first; this is
// the second layer, and it also supplies the typed session to pages).
export async function requireAdminPage(allowed: ("SUPER" | "SUPPORT" | "FINANCE")[]) {
  const session = await getSessionSafe();
  const user = session?.user as unknown as {
    id?: string; role?: string; adminRole?: string | null;
  } | undefined;
  if (!user?.id || user.role !== "ADMIN" || !user.adminRole) redirect("/signin");
  if (!allowed.includes(user.adminRole as "SUPER" | "SUPPORT" | "FINANCE")) redirect("/admin");
  return { id: user.id as string, adminRole: user.adminRole as string };
}
