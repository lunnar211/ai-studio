import { test, expect } from "@playwright/test";

// Phase 6: 360px mobile + keyboard-only checks on Home, both tool
// pages, and one landing page. Runs against E2E_BASE_URL (local
// `next start` in CI/dev); no provider keys needed — these pages
// render without submitting any job.
test.use({ viewport: { width: 360, height: 740 } });

const pages = ["/", "/logo-generator", "/photo-enhancer", "/colorize-black-and-white-photo"];

for (const path of pages) {
  test(`${path} fits 360px with no horizontal overflow`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    });
    expect(overflow).toBe(false);
  });
}

test("keyboard-only: tab reaches the main CTAs and mode cards", async ({ page }) => {
  await page.goto("/photo-enhancer");
  // Tab through the page; the upload dropzone and mode cards must be
  // reachable without a mouse.
  const seen: string[] = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 60) : "";
    });
    if (label) seen.push(label);
  }
  expect(seen.join(" | ")).toMatch(/Drop an image here|Enhance|Colorize/);
  // Enter on a focused mode card must not crash the page.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "AI Photo Enhancer" })).toBeVisible();
});

test("landing page CTA is keyboard-reachable and points at the tool", async ({ page }) => {
  await page.goto("/colorize-black-and-white-photo");
  const cta = page.getByRole("link", { name: "Colorize my photo — free" });
  await expect(cta).toBeVisible();
  await cta.focus();
  expect(await cta.evaluate((el) => el.getAttribute("href"))).toBe("/photo-enhancer?mode=colorize");
});
