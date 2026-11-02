import { describe, expect, it, vi, beforeEach } from "vitest";

// Admin hard gate: no session / non-admin / suspended visitors must be
// redirected BEFORE any admin UI renders, and admin access itself must
// stay role + TOTP gated. next/navigation's redirect() throws in real
// Next.js, so the mock below throws a catchable marker instead.
const { mockGetSession, mockVerifyTotp } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockVerifyTotp: vi.fn(),
}));

vi.mock("../lib/auth", () => ({ getSessionSafe: mockGetSession }));
vi.mock("../lib/totp-cookie", () => ({
  TOTP_COOKIE: "ai-studio-totp",
  verifyTotpCookie: mockVerifyTotp,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));
vi.mock("../lib/settings", () => ({ audit: vi.fn() }));
vi.mock("../lib/rate-limit", () => ({ getClientIp: () => "127.0.0.1" }));
vi.mock("../lib/ip-hash", () => ({ hashIp: () => "hashed-ip" }));

import { requireAdminPage, requireAdminLayout } from "../lib/admin-page";
import { requireAdmin } from "../lib/admin-guard";

function session(over: Record<string, unknown> = {}) {
  return {
    user: {
      id: "user-1",
      supabaseId: "supabase-1",
      email: "owner@example.com",
      name: null,
      image: null,
      role: "ADMIN",
      adminRole: "SUPER",
      plan: "FREE",
      status: "ACTIVE",
      ageConfirmed: true,
      ...over,
    },
  };
}

// Returns the redirect target, or null when the guard passed.
async function redirectPath(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (e) {
    const m = (e as Error).message;
    return m.startsWith("NEXT_REDIRECT:") ? m.slice("NEXT_REDIRECT:".length) : `THREW:${m}`;
  }
}

function apiRequest() {
  return new Request("http://localhost/api/admin/users", {
    headers: { cookie: "ai-studio-totp=marker" },
  });
}

describe("requireAdminPage (per-page gate)", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockVerifyTotp.mockReset();
  });

  it("redirects a visitor with NO session to /signin", async () => {
    mockGetSession.mockResolvedValue(null);
    expect(await redirectPath(requireAdminPage(["SUPER"]))).toBe("/signin");
  });

  it("redirects a signed-in NON-admin to /signin, never to the console", async () => {
    // The session carries no provider field at all: gating is identical
    // for Google and email sign-in, by construction.
    mockGetSession.mockResolvedValue(session({ role: "USER", adminRole: null }));
    expect(await redirectPath(requireAdminPage(["SUPER"]))).toBe("/signin");
  });

  it("redirects a suspended admin to /signin", async () => {
    mockGetSession.mockResolvedValue(session({ status: "SUSPENDED" }));
    expect(await redirectPath(requireAdminPage(["SUPER"]))).toBe("/signin");
  });

  it("redirects an admin without TOTP to verify-2fa", async () => {
    mockGetSession.mockResolvedValue(session({}));
    mockVerifyTotp.mockResolvedValue(false);
    expect(await redirectPath(requireAdminPage(["SUPER"]))).toBe("/admin/verify-2fa");
  });

  it("passes an admin with TOTP, and passes setup pages without TOTP", async () => {
    mockGetSession.mockResolvedValue(session({}));
    mockVerifyTotp.mockResolvedValue(true);
    await expect(requireAdminPage(["SUPER"])).resolves.toEqual({ id: "user-1", adminRole: "SUPER" });
    mockVerifyTotp.mockResolvedValue(false);
    await expect(requireAdminPage(["SUPER"], { skipTotp: true })).resolves.toEqual({
      id: "user-1",
      adminRole: "SUPER",
    });
  });

  it("redirects a wrong-role admin to /admin instead of the restricted page", async () => {
    mockGetSession.mockResolvedValue(session({ adminRole: "FINANCE" }));
    mockVerifyTotp.mockResolvedValue(true);
    expect(await redirectPath(requireAdminPage(["SUPER"]))).toBe("/admin");
  });
});

describe("requireAdminLayout (whole /admin tree hard gate)", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockVerifyTotp.mockReset();
  });

  it("redirects no-session and non-admin visitors to /signin", async () => {
    mockGetSession.mockResolvedValue(null);
    expect(await redirectPath(requireAdminLayout())).toBe("/signin");
    mockGetSession.mockResolvedValue(session({ role: "USER", adminRole: null }));
    expect(await redirectPath(requireAdminLayout())).toBe("/signin");
    mockGetSession.mockResolvedValue(session({ status: "SUSPENDED" }));
    expect(await redirectPath(requireAdminLayout())).toBe("/signin");
  });

  it("passes an admin WITHOUT checking TOTP (pages enforce TOTP themselves)", async () => {
    mockGetSession.mockResolvedValue(session({}));
    mockVerifyTotp.mockResolvedValue(false);
    await expect(requireAdminLayout()).resolves.toEqual({ id: "user-1", adminRole: "SUPER" });
    expect(mockVerifyTotp).not.toHaveBeenCalled();
  });
});

describe("requireAdmin (API gate)", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockVerifyTotp.mockReset();
  });

  it("returns 403 for no session, non-admin, and suspended users", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await requireAdmin(apiRequest(), ["SUPER"])).error?.status).toBe(403);
    mockGetSession.mockResolvedValue(session({ role: "USER", adminRole: null }));
    expect((await requireAdmin(apiRequest(), ["SUPER"])).error?.status).toBe(403);
    mockGetSession.mockResolvedValue(session({ status: "SUSPENDED" }));
    expect((await requireAdmin(apiRequest(), ["SUPER"])).error?.status).toBe(403);
  });

  it("returns 403 without TOTP and the session with TOTP", async () => {
    mockGetSession.mockResolvedValue(session({}));
    mockVerifyTotp.mockResolvedValue(false);
    expect((await requireAdmin(apiRequest(), ["SUPER"])).error?.status).toBe(403);
    mockVerifyTotp.mockResolvedValue(true);
    const ok = await requireAdmin(apiRequest(), ["SUPER"]);
    expect(ok.error).toBeNull();
    expect(ok.session?.id).toBe("user-1");
  });
});
