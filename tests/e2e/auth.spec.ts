import { test, expect } from "@playwright/test";

// Auth-surface checks that need NO live credentials: the test server runs
// without Supabase env vars, so every route must fail honestly (redirect
// to /signin, 401, or a not-configured message) and never crash or leak
// a redirect to an external site.
test("signin page shows not-configured state without Supabase env", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  // SUITE Phase 1 fix: pre-existing stale assertion — the page's actual
  // no-env copy is "not set up yet", not "not configured yet" (the latter
  // only appears in the post-sign-in DB-missing error state). The page
  // copy is the product truth; the spec now asserts what it renders.
  await expect(page.getByText("not set up yet", { exact: false })).toBeVisible();
});

test("callback without a code redirects to signin, never externally", async ({ page }) => {
  await page.goto("/auth/callback?next=https://evil.example.com/steal");
  await expect(page).toHaveURL(/\/signin/);
  expect(page.url()).not.toContain("evil.example.com");
});

test("callback with an external next and no code still lands on signin", async ({ page }) => {
  await page.goto("/auth/callback?next=//evil.example.com");
  await expect(page).toHaveURL(/\/signin/);
});

test("admin and account redirect when logged out", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/signin/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/signin/);
});

test("checkout and account APIs require sign-in", async ({ request }) => {
  const checkout = await request.post("/api/checkout");
  expect(checkout.status()).toBe(401);
  const exp = await request.get("/api/account/export");
  expect(exp.status()).toBe(401);
  const del = await request.post("/api/account/delete");
  expect(del.status()).toBe(401);
});

test("admin API requires sign-in (403, not a stack trace)", async ({ request }) => {
  const res = await request.get("/api/admin/export?type=users");
  expect([401, 403]).toContain(res.status());
});
