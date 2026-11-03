import { describe, it, expect } from "vitest";
import {
  normalizeReason,
  validateCreditAmount,
  applyAdjustments,
  REASON_MAX_LENGTH,
  CREDIT_ADJUST_MAX,
} from "@/lib/admin-audit";

// SUITE Phase 1: the control plane's pure seams. No database, no paid AI
// call, no secrets — these are the rules the routes and forms share, so a
// rule change here breaks a test before it reaches a user.
describe("normalizeReason", () => {
  it("accepts and trims a plain reason", () => {
    expect(normalizeReason("  spam abuse  ")).toEqual({ ok: true, reason: "spam abuse" });
  });
  it("rejects blank, missing, and non-string reasons", () => {
    expect(normalizeReason("")).toEqual({ ok: false, error: "A reason is required for this change." });
    expect(normalizeReason("   ")).toEqual({ ok: false, error: "A reason is required for this change." });
    expect(normalizeReason(undefined)).toEqual({ ok: false, error: "A reason is required for this change." });
    expect(normalizeReason(42)).toEqual({ ok: false, error: "A reason is required for this change." });
  });
  it("rejects over-long reasons and accepts exactly the cap", () => {
    expect(normalizeReason("x".repeat(REASON_MAX_LENGTH + 1)).ok).toBe(false);
    expect(normalizeReason("x".repeat(REASON_MAX_LENGTH))).toEqual({
      ok: true,
      reason: "x".repeat(REASON_MAX_LENGTH),
    });
  });
});

describe("validateCreditAmount", () => {
  it("accepts positive grants and negative removals", () => {
    expect(validateCreditAmount(50)).toEqual({ ok: true, amount: 50 });
    expect(validateCreditAmount(-20)).toEqual({ ok: true, amount: -20 });
  });
  it("rejects zero, fractions, non-numbers, and absurd sizes", () => {
    expect(validateCreditAmount(0).ok).toBe(false);
    expect(validateCreditAmount(1.5).ok).toBe(false);
    expect(validateCreditAmount("50").ok).toBe(false);
    expect(validateCreditAmount(CREDIT_ADJUST_MAX + 1).ok).toBe(false);
    expect(validateCreditAmount(-CREDIT_ADJUST_MAX - 1).ok).toBe(false);
  });
  it("accepts exactly the cap in both directions", () => {
    expect(validateCreditAmount(CREDIT_ADJUST_MAX)).toEqual({ ok: true, amount: CREDIT_ADJUST_MAX });
    expect(validateCreditAmount(-CREDIT_ADJUST_MAX)).toEqual({ ok: true, amount: -CREDIT_ADJUST_MAX });
  });
});

describe("applyAdjustments", () => {
  it("adds grants and removals to the plan budget", () => {
    expect(applyAdjustments(100, 50)).toBe(150);
    expect(applyAdjustments(100, -30)).toBe(70);
    expect(applyAdjustments(100, 0)).toBe(100);
  });
  it("floors at zero instead of going negative", () => {
    expect(applyAdjustments(100, -500)).toBe(0);
  });
});
