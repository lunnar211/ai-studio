import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PASSWORD_SIGNIN_GENERIC_ERROR,
  PASSWORD_SIGNIN_NOT_CONFIGURED,
  signInWithEmailPassword,
} from "../lib/supabase/password-signin";

// Fake Supabase client: only the auth surface the helper touches. No real
// Supabase call, no password value in any fixture — the "password" below
// is a throwaway test string, never a real credential.
function fakeClient(result: { error: unknown }) {
  const signInWithPassword = vi.fn(async () => result);
  const client = { auth: { signInWithPassword } } as unknown as SupabaseClient;
  return { client, signInWithPassword };
}

describe("signInWithEmailPassword (email + password sign-in logic)", () => {
  it("signs in with the trimmed email and the exact password, returning next", async () => {
    const { client, signInWithPassword } = fakeClient({ error: null });
    const result = await signInWithEmailPassword(client, "  owner@example.com ", "test-password", "/account");
    expect(result).toEqual({ ok: true, next: "/account" });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "test-password",
    });
  });

  it("maps any Supabase error to one generic message that leaks nothing", async () => {
    const { client } = fakeClient({ error: { message: "Invalid login credentials" } });
    const result = await signInWithEmailPassword(client, "someone@example.com", "wrong-password", "/account");
    expect(result).toEqual({ ok: false, error: PASSWORD_SIGNIN_GENERIC_ERROR });
    if (!result.ok) {
      // The generic message must never reveal which account exists or
      // which field was wrong.
      expect(result.error).not.toContain("someone@example.com");
      expect(result.error).not.toContain("wrong-password");
    }
  });

  it("returns the not-configured message when there is no Supabase client", async () => {
    const result = await signInWithEmailPassword(null, "a@example.com", "pw", "/account");
    expect(result).toEqual({ ok: false, error: PASSWORD_SIGNIN_NOT_CONFIGURED });
  });
});

const { signOutSpy } = vi.hoisted(() => ({ signOutSpy: vi.fn(async () => undefined) }));
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(() => ({ auth: { signOut: signOutSpy } })),
}));

describe("supabaseSignOut (shared sign-out path)", () => {
  beforeEach(() => {
    vi.resetModules();
    signOutSpy.mockClear();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("does nothing (and never throws) when Supabase is not configured", async () => {
    const mod = await import("../lib/supabase/client");
    await expect(mod.supabaseSignOut()).resolves.toBeUndefined();
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it("calls the Supabase signOut once when configured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    const mod = await import("../lib/supabase/client");
    await mod.supabaseSignOut();
    expect(signOutSpy).toHaveBeenCalledTimes(1);
  });

  it("swallows a signOut failure instead of throwing into the UI", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    signOutSpy.mockRejectedValueOnce(new Error("network down"));
    const mod = await import("../lib/supabase/client");
    await expect(mod.supabaseSignOut()).resolves.toBeUndefined();
  });
});
