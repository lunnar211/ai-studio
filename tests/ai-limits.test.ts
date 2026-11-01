// Phase 0: the single limits config is the source of truth — credit
// costs and budgets match the documented policy, and the effective
// limits fall back to those defaults when no DB is configured.

import { describe, expect, it } from "vitest";
import { LIMITS, getEffectiveLimits, photoCreditBudgetFor, logoRequestBudgetFor } from "../lib/limits";
import { PHOTO_CREDIT_COST } from "../lib/ai/credits";

describe("single limits config", () => {
  it("defines the documented Free/Premium budgets", () => {
    expect(LIMITS.photoCreditsFree).toBe(10);
    expect(LIMITS.photoCreditsPremium).toBe(100);
    expect(LIMITS.logoRequestsFree).toBe(10);
    expect(LIMITS.logoRequestsPremium).toBe(100);
  });
  it("defines the documented photo credit costs", () => {
    expect(LIMITS.photoCreditCost.enhance).toBe(1);
    expect(LIMITS.photoCreditCost.colorize).toBe(2);
    expect(LIMITS.photoCreditCost.restore).toBe(2);
    expect(LIMITS.photoCreditCost["colorize-hd"]).toBe(3);
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
    expect(l.photoCreditsFree).toBe(10);
    expect(l.photoCreditsPremium).toBe(100);
    expect(l.logoRequestsFree).toBe(10);
    expect(l.logoRequestsPremium).toBe(100);
    expect(await photoCreditBudgetFor("FREE")).toBe(10);
    expect(await photoCreditBudgetFor("PREMIUM")).toBe(100);
    expect(await logoRequestBudgetFor("FREE")).toBe(10);
    expect(await logoRequestBudgetFor("PREMIUM")).toBe(100);
  });
});
