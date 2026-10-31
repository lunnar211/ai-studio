// Age gates (see /terms and COMPLIANCE_CHECKLIST.md for the reasoning):
// under 13 -> blocked entirely, no data kept (COPPA + GDPR-K lower bound).
// 13-15 -> cannot be activated. 16-17 -> free account only, paid blocked.
// 18+ -> paid plans allowed. Self-declaration only, no ID documents.
export function ageInYears(dob: Date, now = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

export type AgeGate = "BLOCKED_UNDER_13" | "BLOCKED_UNDER_16" | "FREE_ONLY" | "FULL";

export function ageGate(dob: Date, now = new Date()): AgeGate {
  const age = ageInYears(dob, now);
  if (age < 13) return "BLOCKED_UNDER_13";
  if (age < 16) return "BLOCKED_UNDER_16";
  if (age < 18) return "FREE_ONLY";
  return "FULL";
}

export function parseDob(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Reject impossible dates like 2026-02-30 that JS rolls over.
  if (d.toISOString().slice(0, 10) !== value) return null;
  if (d.getTime() > Date.now()) return null;
  return d;
}
