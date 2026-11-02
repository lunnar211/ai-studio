"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { oauthCallbackUrl } from "@/lib/supabase/oauth-redirect";
import { Button } from "@/components/ui/button";

export function SignInButton({ next = "/account" }: { next?: string }) {
  const [error, setError] = useState("");
  async function run() {
    setError("");
    const client = createSupabaseBrowserClient();
    if (!client) {
      setError("Sign-in is not configured yet.");
      return;
    }
    // Redirects to this site's own /auth/callback route, which exchanges
    // the code and validates `next` (relative paths only) server-side.
    const redirectTo = oauthCallbackUrl(window.location.origin, next);
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setError("Sign-in could not be started. Please try again.");
  }
  return (
    <div>
      <Button type="button" className="w-full" onClick={run}>
        Sign in with Google
      </Button>
      {error && (
        <p className="mt-2 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
