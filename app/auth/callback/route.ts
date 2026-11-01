import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensurePrismaUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeRedirectPath } from "@/lib/redirect";

export const dynamic = "force-dynamic";

// Supabase OAuth callback (Google). Exchanges the code for a session,
// maps the Supabase user to its Prisma row (first-login upsert), then
// redirects to the validated `next` destination. `next` accepts RELATIVE
// paths only — absolute or external URLs are rejected (see
// lib/redirect.ts), so this route can never be used as an open redirect.
// Owner tap still required before this works live: the Supabase dashboard
// redirect URL must include https://ai-studio-sandy-sigma.vercel.app/auth/callback
// and the Vercel env vars must be set (see README).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeRedirectPath(url.searchParams.get("next"), "/account");
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));

  if (!code) return to("/signin");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return to("/signin?error=not-configured");
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return to("/signin?error=auth-failed");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return to("/signin?error=auth-failed");

  if (!prisma) {
    // Signed in at Supabase, but the app database is not configured, so
    // no account features exist yet. Sign out to avoid a /account ->
    // /signin loop, and say so honestly on the sign-in page.
    await supabase.auth.signOut().catch(() => undefined);
    return to("/signin?error=db-not-configured");
  }
  const dbUser = await ensurePrismaUser({
    id: user.id,
    email: user.email,
    name: (user.user_metadata?.full_name as string | undefined) ?? user.user_metadata?.name ?? null,
    image: (user.user_metadata?.avatar_url as string | undefined) ?? user.user_metadata?.picture ?? null,
  });
  if (!dbUser) return to("/signin?error=auth-failed");
  if (dbUser.status === "SUSPENDED") {
    await supabase.auth.signOut().catch(() => undefined);
    return to("/signin?error=suspended");
  }
  // Age confirmation gates account features: unconfirmed users go to
  // onboarding first (unless that is already where they were heading).
  if (!dbUser.ageConfirmed && next !== "/onboarding") return to("/onboarding");
  return to(next);
}
