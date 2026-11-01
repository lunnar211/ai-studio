import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "./lib/supabase/middleware";

// proxy.ts — the Next.js 16 convention (middleware.ts is deprecated in
// 16.4 and logs a warning at build time, so this repo uses proxy.ts).
// NO Prisma, NO database calls here. The proxy only refreshes the
// Supabase session and enforces "signed in" for /admin, /account and
// /onboarding. Roles, suspension, age confirmation and TOTP are enforced
// server-side by pages and API routes (lib/admin-page.ts, lib/admin-guard.ts,
// app/account/page.tsx), because they live in Prisma, which the proxy
// must not touch. Age-onboarding redirection for signed-in users happens
// in the /auth/callback route and on /account, not here.

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const { response, user } = await updateSupabaseSession(req);
  const redirect = (to: string) => NextResponse.redirect(new URL(to, req.url));

  if (path.startsWith("/admin") || path.startsWith("/account") || path === "/onboarding") {
    if (!user) {
      // Preserve the destination through the validated `next` param so a
      // successful login lands back where the user was going.
      return redirect(`/signin?next=${encodeURIComponent(path)}`);
    }
    return response;
  }
  return response;
}

export const config = {
  matcher: [
    "/",
    "/logo-generator",
    "/photo-enhancer",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/disclaimer",
    "/cookies",
    "/refund-policy",
    "/acceptable-use",
    "/dmca",
    "/account/:path*",
    "/admin/:path*",
    "/onboarding",
    "/signin",
    "/auth/callback",
  ],
};
