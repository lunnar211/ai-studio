import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import sharp from "sharp";

/**
 * Free + unlimited photo UI (server-only colorize): free paths show no
 * credit numbers, server-unavailable colorize shows a plain
 * server-not-set-up message with free Enhance as the fallback — never
 * a browser path (the browser model was removed after it kept
 * crashing tabs on memory) — and the grayscale gate is a hint with a
 * "Colorize anyway" override, never a block.
 *
 * These specs run against a local server with no image provider
 * configured, so server colorize is honestly unavailable.
 */

test("colorize page shows free-unlimited copy and the server-not-set-up message, never a browser action", async ({ page }) => {
  await page.goto("/photo-enhancer?mode=colorize");
  await expect(page.getByText("Free — unlimited", { exact: false }).first()).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/credits per day/i);
  expect(body).not.toMatch(/will use \d+ credit/i);
  // Server colorize is unconfigured locally, so the page says so
  // plainly and offers free Enhance — not a browser colorize button.
  await expect(page.getByText(/Server colorize is not set up right now/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Colorize free in browser" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enhance photo — free, unlimited" })).toBeVisible();
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
    // The override clears the hint; with the server unconfigured the
    // usable free action is Enhance (no browser colorize exists now).
    await expect(page.getByRole("button", { name: "Enhance photo — free, unlimited" })).toBeVisible();
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
