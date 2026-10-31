import type { Metadata } from "next";
import { SignInButton } from "./SignInButton";
import { authConfigured } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in — AI Studio",
  description: "Sign in to AI Studio with Google for higher daily limits and job history.",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-4xl font-bold italic">Sign in</h1>
      <p className="mt-3 text-lg text-muted-fg dark:text-slate-300">
        Sign in with Google for higher daily limits, job history, and an account page.
        Guests can still use both tools with the free daily limit — no account needed.
      </p>
      <div className="mt-6 border-2 border-line bg-white p-6 dark:bg-slate-900">
        {authConfigured ? (
          <SignInButton />
        ) : (
          <p className="text-muted-fg dark:text-slate-300">
            Sign-in is not configured yet. The site owner needs to add the Google OAuth
            credentials and database URL (see README) before this button can work.
            The logo generator and photo enhancer still work as guest tools.
          </p>
        )}
        <p className="mt-4 text-sm text-muted-fg dark:text-slate-400">
          Only Google sign-in is offered, with minimal scopes (openid, email, profile).
          No password is ever created or stored here. By signing in you accept the{" "}
          <a className="underline" href="/terms">Terms</a> and{" "}
          <a className="underline" href="/privacy">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
