import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { TOTP_COOKIE, TOTP_WINDOW_MS, verifyTotpCookie } from "./lib/totp-cookie";

// Edge middleware (kept as middleware.ts deliberately: in Next.js 16 the
// `proxy` convention runs on Node.js, not Edge — see repo AGENTS.md note).
// NO Prisma, NO database calls here. Everything is read from the JWT cookie
// (role, adminRole, plan, totpVerifiedAt) or the signed TOTP cookie.
// API routes enforce the same rules again server-side (defense in depth).

const TOTP_EXEMPT = ["/admin/setup-2fa", "/admin/verify-2fa"];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const secret = process.env.AUTH_SECRET;
  let token: Record<string, unknown> | null = null;
  if (secret) {
    try {
      token = (await getToken({ req, secret })) as Record<string, unknown> | null;
    } catch {
      token = null;
    }
  }

  const redirect = (to: string) => NextResponse.redirect(new URL(to, req.url));

  if (path.startsWith("/admin")) {
    if (!token?.id) return redirect("/signin");
    if (token.role !== "ADMIN" || !token.adminRole) return redirect("/signin");
    if (token.status === "SUSPENDED") return redirect("/signin");
    if (!TOTP_EXEMPT.includes(path)) {
      const jwtOk =
        typeof token.totpVerifiedAt === "number" &&
        Date.now() - token.totpVerifiedAt < TOTP_WINDOW_MS;
      const cookieOk = await verifyTotpCookie(
        req.cookies.get(TOTP_COOKIE)?.value,
        token.id as string,
        secret || ""
      );
      if (!jwtOk && !cookieOk) return redirect("/admin/verify-2fa");
    }
    return NextResponse.next();
  }

  if (path.startsWith("/account")) {
    if (!token?.id) return redirect("/signin");
    return NextResponse.next();
  }

  if (path === "/onboarding") {
    if (!token?.id) return redirect("/signin");
    return NextResponse.next();
  }

  // Onboarding enforcement for signed-in users on other pages.
  if (token?.id && token.ageConfirmed !== true && path !== "/signin") {
    return redirect("/onboarding");
  }

  return NextResponse.next();
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
  ],
};
