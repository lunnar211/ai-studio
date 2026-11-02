import { describe, expect, it } from "vitest";
import { oauthCallbackUrl } from "../lib/supabase/oauth-redirect";

describe("oauthCallbackUrl (Google sign-in redirect target)", () => {
  it("always points at this site's own origin + /auth/callback", () => {
    expect(oauthCallbackUrl("https://ai-studio-sandy-sigma.vercel.app", "/account")).toBe(
      "https://ai-studio-sandy-sigma.vercel.app/auth/callback?next=%2Faccount"
    );
    expect(oauthCallbackUrl("http://localhost:3000", "/admin")).toBe(
      "http://localhost:3000/auth/callback?next=%2Fadmin"
    );
  });

  it("encodes next so it can never break out of the callback query", () => {
    const url = oauthCallbackUrl("https://ai-studio-sandy-sigma.vercel.app", "/admin/users?x=1&y=2");
    expect(url).toBe(
      "https://ai-studio-sandy-sigma.vercel.app/auth/callback?next=%2Fadmin%2Fusers%3Fx%3D1%26y%3D2"
    );
    expect(url.startsWith("https://ai-studio-sandy-sigma.vercel.app/auth/callback?next=")).toBe(true);
  });

  it("never rewrites the origin, whatever next contains", () => {
    // Even a hostile next value stays inside this site's callback URL;
    // the callback itself then rejects non-local paths via safeRedirectPath.
    const url = oauthCallbackUrl("https://ai-studio-sandy-sigma.vercel.app", "https://evil.example.com/");
    expect(url.startsWith("https://ai-studio-sandy-sigma.vercel.app/auth/callback?next=")).toBe(true);
  });
});
