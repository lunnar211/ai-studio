import { test, expect } from "@playwright/test";

test("home loads with both tools", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Make a logo/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Generate a logo" })).toBeVisible();
});

test("tool pages render", async ({ page }) => {
  await page.goto("/logo-generator");
  await expect(page.getByRole("heading", { name: "Get a professional logo in 10 seconds. Free." })).toBeVisible();
  await expect(page.getByText("AI disclosure", { exact: false })).toBeVisible();
  // Gallery above the generator: 9 original examples, clickable.
  await expect(page.getByRole("region", { name: "Example logos" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Use example:/ })).toHaveCount(9);
  // Free-tier counter + suggested prompts + brand-name input.
  await expect(page.getByText(/left today|logos per day/)).toBeVisible();
  await expect(page.getByRole("button", { name: "mountain coffee roaster", exact: true })).toBeVisible();
  await expect(page.getByLabel("Brand name (optional)")).toBeVisible();
  await page.goto("/photo-enhancer");
  await expect(page.getByRole("heading", { name: "AI Photo Enhancer" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Drop an image here/ })).toBeVisible();
});

test("pricing, FAQ and use-case pages render", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Pricing" })).toBeVisible();
  // Paddle-configured envs show the checkout price note; unconfigured
  // envs honestly say checkout is not configured (Upgrade hidden).
  await expect(page.getByText(/Price shown at checkout|checkout is not configured yet/)).toBeVisible();
  await page.goto("/faq");
  await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeVisible();
  await expect(page.getByText("Why was my prompt refused?")).toBeVisible();
  for (const [path, heading] of [
    ["/logo-for-coffee-shop", "Logo for a coffee shop"],
    ["/logo-for-tech-startup", "Logo for a tech startup"],
    ["/logo-for-fitness-studio", "Logo for a fitness studio"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByRole("link", { name: /Generate my .* logo — free/ })).toBeVisible();
  }
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
  expect(text).toContain("/pricing");
  expect(text).toContain("/logo-for-coffee-shop");
});
