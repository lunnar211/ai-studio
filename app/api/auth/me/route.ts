import { NextResponse } from "next/server";
import { getSessionSafe } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Minimal session probe for the header: returns ONLY whether the
// visitor is signed in, and whether they are an admin (so the header
// and footer show the Admin link to admins only). No email, id, or
// other personal data leaves this endpoint, so it is safe to call
// from every page. Linking to /admin never grants access: the admin
// pages and APIs still enforce admin role + fresh TOTP server-side.
export async function GET() {
  const session = await getSessionSafe().catch(() => null);
  const user = session?.user;
  return NextResponse.json({
    signedIn: Boolean(user),
    isAdmin: Boolean(user && user.role === "ADMIN"),
  });
}
