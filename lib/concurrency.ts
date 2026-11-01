// Cap on concurrent AI prediction starts (fail-fast, no queue).
//
// Scope, stated honestly: this is an in-memory counter, so it binds
// only within one serverless instance — the same documented limitation
// as the in-memory rate limiter. It is the SECOND line of defence: the
// per-IP 5/min limiter throttles callers, and this cap protects shared
// provider quota from a burst of concurrent starts. Poll continuations
// (one job advancing its own stages) are not counted: they are
// sequential per job and bounded by the number of live jobs.
// Env override: AI_MAX_CONCURRENT_STARTS (default 10).
const slots = { used: 0 };

export function aiStartLimit(): number {
  const raw = Number(process.env.AI_MAX_CONCURRENT_STARTS ?? 10);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10;
}

/** Try to take one start slot. Returns false when the cap is reached. */
export function tryAcquireAiStartSlot(): boolean {
  if (slots.used >= aiStartLimit()) return false;
  slots.used += 1;
  return true;
}

/** Release a previously acquired slot. Never lets the count go negative. */
export function releaseAiStartSlot(): void {
  slots.used = Math.max(0, slots.used - 1);
}

/** Test/observability hook: how many start slots are held right now. */
export function aiStartSlotsUsed(): number {
  return slots.used;
}
