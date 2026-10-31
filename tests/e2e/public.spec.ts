import { test, expect } from "@playwright/test";

test("home loads with both tools", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Make a logo/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Generate a logo" })).toBeVisible();
});

test("tool pages render", async ({ page }) => {
  await page.goto("/logo-generator");
  await expect(page.getByRole("heading", { name: "AI Logo Generator" })).toBeVisible();
  await expect(page.getByText("AI disclosure", { exact: false })).toBeVisible();
  await page.goto("/photo-enhancer");
  await expect(page.getByRole("heading", { name: "AI Photo Enhancer" })).toBeVisible();
});

test("legal pages render", async ({ page }) => {
  for (const path of ["/privacy", "/terms", "/cookies", "/refund-policy", "/acceptable-use", "/dmca"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
  }
});

test("admin and account redirect when logged out", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/signin/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/signin/);
});

test("cookie banner can be dismissed", async ({ page }) => {
  await page.goto("/");
  const banner = page.getByRole("region", { name: "Cookie consent" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Decline" }).click();
  await expect(banner).toHaveCount(0);
});

test("sitemap excludes admin and account", async ({ page }) => {
  const res = await page.goto("/sitemap.xml");
  expect(res?.status()).toBe(200);
  const text = await page.content();
  expect(text).not.toContain("/admin");
  expect(text).not.toContain("/account");
});
