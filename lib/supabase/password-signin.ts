import type { SupabaseClient } from "@supabase/supabase-js";

// Email + password sign-in via Supabase Auth, shared by the sign-in form
// (app/signin/PasswordSignIn.tsx). This is an OPTION for accounts the site
// owner created in the Supabase dashboard (Authentication → Add user) —
// there is no self-service password signup here, and no password is ever
// stored in code. Errors are deliberately generic: one message covers a
// wrong password, an unknown email, an unconfirmed email, and an account
// that only has Google sign-in, so the form never reveals which accounts
// exist. TOTP for /admin is enforced separately on every admin page and
// API route, whichever way the admin signed in. On success the caller
// navigates to `next` with a full page load so server components re-read
// the fresh session cookies, exactly like the OAuth callback redirect.
export const PASSWORD_SIGNIN_NOT_CONFIGURED = "Sign-in is not set up yet.";
export const PASSWORD_SIGNIN_GENERIC_ERROR =
  "Invalid email or password, or this account is not set up for password sign-in yet.";

export type PasswordSignInResult = { ok: true; next: string } | { ok: false; error: string };

export async function signInWithEmailPassword(
  client: SupabaseClient | null,
  email: string,
  password: string,
  next: string
): Promise<PasswordSignInResult> {
  if (!client) return { ok: false, error: PASSWORD_SIGNIN_NOT_CONFIGURED };
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { ok: false, error: PASSWORD_SIGNIN_GENERIC_ERROR };
  return { ok: true, next };
}
