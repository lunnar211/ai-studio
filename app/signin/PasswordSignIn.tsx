"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label, TextInput } from "@/components/ui/field";

// Email + password sign-in (Supabase Auth) alongside Google. This is an
// OPTION for accounts the site owner created in the Supabase dashboard
// (Authentication → Add user) — there is no self-service password
// signup here, and no password is ever stored in code. Errors are
// deliberately generic: one message covers a wrong password, an
// unknown email, an unconfirmed email, and an account that only has
// Google sign-in, so the form never reveals which accounts exist.
// TOTP for /admin is enforced separately on every admin page and API
// route, whichever way the admin signed in.
export function PasswordSignIn({ next = "/account" }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const client = createSupabaseBrowserClient();
    if (!client) {
      setError("Sign-in is not set up yet.");
      setBusy(false);
      return;
    }
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError("Invalid email or password, or this account is not set up for password sign-in yet.");
      return;
    }
    // Full navigation (not router.push) so server components re-read the
    // fresh session cookies, exactly like the OAuth callback redirect.
    window.location.assign(next);
  }

  return (
    <form onSubmit={run} className="mt-6 border-t-2 border-line pt-6" aria-label="Sign in with email and password">
      <h2 className="font-bold">Sign in with email and password</h2>
      <p className="mt-1 text-sm text-muted-fg dark:text-slate-400">
        For accounts the site owner created. Google sign-in above is the primary way in.
      </p>
      <div className="mt-3">
        <Label htmlFor="signin-email">Email</Label>
        <TextInput
          id="signin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>
      <div className="mt-3">
        <Label htmlFor="signin-password">Password</Label>
        <TextInput
          id="signin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      {error && (
        <p className="mt-3 text-sm" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="secondary" className="mt-4 w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in with email"}
      </Button>
    </form>
  );
}
