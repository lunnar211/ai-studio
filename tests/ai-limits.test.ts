// FREE + UNLIMITED model (2026-11-01): the single limits config is
// the source of truth — free photos are unlimited (no free photo
// budget at all), Premium paid-GPU jobs use the GPU budget, and logo
// budgets are unchanged. The credits module must not define its own
// numbers.

import { describe, expect, it } from "vitest";
import { LIMITS, getEffectiveLimits, photoCreditBudgetFor, logoRequestBudgetFor } from "../lib/limits";
import { PHOTO_CREDIT_COST } from "../lib/ai/credits";

describe("single limits config (free-unlimited photos)", () => {
  it("declares free photos unlimited and keeps the Premium GPU budget", () => {
    expect(LIMITS.photoFreeUnlimited).toBe(true);
    expect(LIMITS.photoCreditsPremium).toBe(100);
    expect("photoCreditsFree" in LIMITS).toBe(false);
    expect(LIMITS.logoRequestsFree).toBe(10);
    expect(LIMITS.logoRequestsPremium).toBe(100);
  });
  it("defines the Premium paid-GPU costs (exactly 3 modes, free paths never charge them)", () => {
    expect(LIMITS.photoCreditCost.enhance).toBe(1);
    expect(LIMITS.photoCreditCost.colorize).toBe(2);
    expect(LIMITS.photoCreditCost.restore).toBe(3);
    expect(Object.keys(LIMITS.photoCreditCost).sort()).toEqual(["colorize", "enhance", "restore"]);
    expect(LIMITS.photoModeLabel.restore).toBe("Restore + Colorize");
    // The credits module must not define its own numbers.
    expect(PHOTO_CREDIT_COST).toBe(LIMITS.photoCreditCost);
  });
  it("keeps HD 4x/4096px Premium-only and 2x/2048px for Free", () => {
    expect(LIMITS.hdScale.FREE).toBe(2);
    expect(LIMITS.hdScale.PREMIUM).toBe(4);
    expect(LIMITS.hdMaxEdge.FREE).toBe(2048);
    expect(LIMITS.hdMaxEdge.PREMIUM).toBe(4096);
  });
  it("falls back to the defaults without a database", async () => {
    const l = await getEffectiveLimits();
    expect(l.photoFreeUnlimited).toBe(true);
    expect(l.photoCreditsPremium).toBe(100);
    expect(l.logoRequestsFree).toBe(10);
    expect(l.logoRequestsPremium).toBe(100);
    expect(await photoCreditBudgetFor("FREE")).toBe(Number.POSITIVE_INFINITY);
    expect(await photoCreditBudgetFor("PREMIUM")).toBe(100);
    expect(await logoRequestBudgetFor("FREE")).toBe(10);
    expect(await logoRequestBudgetFor("PREMIUM")).toBe(100);
  });
});
