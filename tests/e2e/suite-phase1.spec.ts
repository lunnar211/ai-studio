import { test, expect } from "@playwright/test";

// SUITE Phase 1 control-plane gating, provable WITHOUT live credentials:
// the test server runs without Supabase env vars, so every panel route
// must fail honestly (redirect to /signin, or 403) and never render panel
// UI, another user's data, or a stack trace. Signed-in own-data-only
// behavior is guaranteed in code (every panel query filters by the
// session user id; no panel route accepts a caller-supplied user id for
// panel data) and cannot run here without a real session — see
// docs/SUITE-PHASE1.md QA checklist for the live check.

test("user panel redirects when logged out (account + dashboard)", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/signin/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/signin/);
});

test("master panels redirect when logged out (audit + credits)", async ({ page }) => {
  await page.goto("/admin/audit");
  await expect(page).toHaveURL(/\/signin/);
  await page.goto("/admin/credits");
  await expect(page).toHaveURL(/\/signin/);
});

test("credits API requires admin sign-in (403, not a stack trace)", async ({ request }) => {
  const res = await request.post("/api/admin/credits", {
    data: { userId: "x", amount: 10, reason: "test" },
  });
  expect(res.status()).toBe(403);
  const body = await res.json().catch(() => ({}));
  expect(JSON.stringify(body)).not.toContain("prisma");
  expect(JSON.stringify(body)).not.toContain("Error:");
});

test("credits API rejects a bad body only after auth (still 403 logged out)", async ({ request }) => {
  // Order matters: auth runs before validation, so a logged-out caller
  // learns nothing about validation rules from the error shape.
  const res = await request.post("/api/admin/credits", { data: { nonsense: true } });
  expect(res.status()).toBe(403);
});
