import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import sharp from "sharp";

/**
 * Free + unlimited photo UI (2026-11-01 fix): free paths show no credit
 * numbers, server-unavailable colorize offers the free browser path as
 * the primary action, and the grayscale gate is a hint with a
 * "Colorize anyway" override — never a block.
 *
 * These specs run against a local server with no image provider
 * configured, so server colorize is honestly unavailable and the free
 * browser path is the primary action. They do NOT run the browser
 * colorize model (64 MB download, env-gated separately).
 */

test("colorize page shows free-unlimited copy and the free browser action", async ({ page }) => {
  await page.goto("/photo-enhancer?mode=colorize");
  await expect(page.getByText("Free — unlimited", { exact: false }).first()).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/credits per day/i);
  expect(body).not.toMatch(/will use \d+ credit/i);
  // Server colorize is unconfigured locally, so the free browser path
  // is the primary action — not a red dead-end box.
  await expect(page.getByRole("button", { name: "Colorize free in browser" })).toBeVisible();
  await expect(page.getByText(/Server colorize is not set up right now/).first()).toBeVisible();
});

test("faded sepia photo gets a Colorize anyway override, not a block", async ({ page }) => {
  // Sepia fixture: warm-tinted gradient. The UI's canvas measure
  // (mean max channel difference) reads it as "color", exactly like a
  // faded old photo that the old gate refused to colorize.
  const tmp = path.join(os.tmpdir(), `ai-studio-sepia-${process.pid}.png`);
  const w = 64;
  const h = 64;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const v = 90 + Math.round((x / w) * 90);
      raw[o] = Math.min(255, v + 45); // R warm
      raw[o + 1] = v; // G
      raw[o + 2] = Math.max(0, v - 45); // B cool — strong chroma
    }
  }
  await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toFile(tmp);
  try {
    await page.goto("/photo-enhancer?mode=colorize");
    await page.getByLabel("Choose an image file").setInputFiles(tmp);
    await expect(page.getByRole("button", { name: "Colorize anyway" })).toBeVisible();
    await expect(page.getByText(/looks like it already has colour/)).toBeVisible();
    // The override clears the hint and leaves the free action usable.
    await page.getByRole("button", { name: "Colorize anyway" }).click();
    await expect(page.getByRole("button", { name: "Colorize anyway" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Colorize free in browser" })).toBeVisible();
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test("pricing page states the free-unlimited model", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByText(/Unlimited photo enhance, colorize and restore/)).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/photo credits per day/i);
});

// Real-weights browser colorize: downloads the ~64 MB model and runs
// ONNX inference in the browser. SKIPPED by default — it needs a
// browser with internet to the model host, which the sandbox does not
// have. Run it on a real machine with:
//   E2E_BROWSER_COLORIZE=1 npx playwright test tests/e2e/free-photo.spec.ts -g "real-weights"
test("real-weights browser colorize on a black & white photo", async ({ page }) => {
  test.skip(process.env.E2E_BROWSER_COLORIZE !== "1", "needs a browser with internet to the model host");
  const tmp = path.join(os.tmpdir(), `ai-studio-bw-${process.pid}.png`);
  const w = 64;
  const h = 64;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const v = 60 + Math.round((x / w) * 120);
      raw[o] = v;
      raw[o + 1] = v;
      raw[o + 2] = v;
    }
  }
  await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toFile(tmp);
  try {
    await page.goto("/photo-enhancer?mode=colorize");
    await page.getByLabel("Choose an image file").setInputFiles(tmp);
    await page.getByRole("button", { name: "Colorize free in browser" }).click();
    // Model download (~64 MB, one-time) + inference; generous timeout.
    await expect(page.getByAltText("Photo after processing")).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText(/Colorized on your device/)).toBeVisible();
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});
