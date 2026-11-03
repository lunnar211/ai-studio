// Admin-action validation seams (SUITE Phase 1). Pure functions, so they
// are unit-testable without a database. Every user-affecting admin action
// (suspend, plan, role, limits reset, delete, credit adjustment) requires
// a human-written reason: the audit trail is only useful if it says WHY,
// not just what. Reasons are capped so one row can never smuggle a novel
// into the audit table, and credit amounts are capped so a typo cannot
// grant a lifetime of GPU budget.

export const REASON_MAX_LENGTH = 500;
export const CREDIT_ADJUST_MAX = 10000;

export function normalizeReason(
  reason: unknown
): { ok: true; reason: string } | { ok: false; error: string } {
  if (typeof reason !== "string") {
    return { ok: false, error: "A reason is required for this change." };
  }
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "A reason is required for this change." };
  }
  if (trimmed.length > REASON_MAX_LENGTH) {
    return {
      ok: false,
      error: `Reason must be ${REASON_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, reason: trimmed };
}

export function validateCreditAmount(
  amount: unknown
): { ok: true; amount: number } | { ok: false; error: string } {
  if (typeof amount !== "number" || !Number.isInteger(amount)) {
    return { ok: false, error: "Amount must be a whole number of GPU units." };
  }
  if (amount === 0) {
    return { ok: false, error: "Amount must not be zero — grant (+) or remove (−)." };
  }
  if (Math.abs(amount) > CREDIT_ADJUST_MAX) {
    return {
      ok: false,
      error: `Amount must be between -${CREDIT_ADJUST_MAX} and ${CREDIT_ADJUST_MAX}.`,
    };
  }
  return { ok: true, amount };
}

/**
 * Pure budget math for credit adjustments (unit-testable): a user's
 * effective Premium GPU budget is the plan budget plus every recorded
 * adjustment, floored at zero so a large removal can never drive the
 * budget negative (a zero budget simply blocks paid-GPU jobs).
 */
export function applyAdjustments(planBudget: number, adjustmentsTotal: number): number {
  return Math.max(0, planBudget + adjustmentsTotal);
}
