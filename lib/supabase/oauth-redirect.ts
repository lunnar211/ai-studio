// Google OAuth redirect target for Supabase Auth. Supabase must redirect
// back to THIS site's own /auth/callback (which exchanges the code and
// then redirects only within this site via safeRedirectPath) — never to
// another site. The origin comes from the browser's current origin at
// click time, so the same code is correct on every deployment; the only
// way Supabase lands elsewhere is its dashboard Redirect URLs allowlist
// (a dashboard setting, not code — see docs/EMAIL_LOGIN.md).
export function oauthCallbackUrl(origin: string, next: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}
