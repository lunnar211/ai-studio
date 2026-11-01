import type { Metadata } from "next";
import { SignInButton } from "./SignInButton";
import { authConfigured } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/redirect";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to AI Studio with Google to save your logo history and photo jobs.",
  robots: { index: false, follow: false },
};

const ERRORS: Record<string, string> = {
  suspended: "This account is suspended. Contact support if you think this is a mistake.",
  "db-not-configured":
    "Sign-in worked, but the site database is not configured yet, so no account could be created. The tools still work as guest tools.",
  "not-configured": "Sign-in is not configured yet.",
  "auth-failed": "Sign-in failed. Please try again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next, "/account");
  const errorMsg = params.error ? ERRORS[params.error] : undefined;
  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-4xl font-bold italic">Sign in</h1>
      <p className="mt-3 text-lg text-muted-fg dark:text-slate-300">
        Sign in with Google to save your logo history and photo jobs on your account page.
        Guests can still use both tools free and unlimited — no account needed.
      </p>
      <div className="mt-6 border-2 border-line bg-white p-6 dark:bg-slate-900">
        {errorMsg && (
          <p className="mb-4 text-muted-fg dark:text-slate-300" role="alert">
            {errorMsg}
          </p>
        )}
        {authConfigured ? (
          <SignInButton next={next} />
        ) : (
          <p className="text-muted-fg dark:text-slate-300">
            Sign-in is not set up yet. The site owner needs to connect the login
            service before this button can work.
            The logo generator and photo enhancer still work as guest tools.
          </p>
        )}
        <p className="mt-4 text-sm text-muted-fg dark:text-slate-400">
          Only Google sign-in is offered, with minimal scopes (openid, email, profile),
          via Supabase Auth. No password is ever created or stored here. By signing in
          you accept the{" "}
          <a className="underline" href="/terms">Terms</a> and{" "}
          <a className="underline" href="/privacy">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
