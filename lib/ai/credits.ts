// Photo credit accounting — reads the SINGLE limits config
// (lib/limits.ts); this module only implements the accounting, it does
// not define any number. Signed-in users: credits spent today = sum of
// AiUsageLog credits for photo jobs, falling back to Job rows (whose
// inputSummary records the mode) when the usage table does not exist
// yet (schema not pushed). Guests: the per-IP limiter bucket holds the
// free budget in units and each credit consumes one unit.

import { prisma } from "../prisma";
import { countJobsToday } from "../settings";
import { checkAiRateLimit, getClientIp } from "../rate-limit";
import {
  LIMITS,
  photoCreditBudgetFor,
  type PhotoMode,
} from "../limits";

export type { PhotoMode };
export const PHOTO_CREDIT_COST = LIMITS.photoCreditCost;
export const PHOTO_MODE_LABEL = LIMITS.photoModeLabel;

export async function photoCreditsUsedToday(userId: string): Promise<number> {
  if (!prisma) return 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  try {
    const rows = await prisma.aiUsageLog.findMany({
      where: { userId, createdAt: { gte: start }, capability: { in: ["image-colorize", "image-upscale"] } },
      select: { credits: true },
    });
    if (rows.length > 0) {
      return rows.reduce((sum, r) => sum + r.credits, 0);
    }
  } catch {
    // Table missing (schema not pushed): fall through to Job rows.
  }
  try {
    const jobs = await prisma.job.findMany({
      where: { userId, createdAt: { gte: start }, tool: { in: ["enhance", "colorize", "restore"] } },
      select: { tool: true, inputSummary: true },
    });
    return jobs.reduce((sum, j) => {
      const mode = (j.inputSummary ?? "").split(":")[0] as PhotoMode;
      return sum + (PHOTO_CREDIT_COST[mode] ?? 1);
    }, 0);
  } catch {
    return 0;
  }
}

export async function photoCreditBudget(plan: "FREE" | "PREMIUM"): Promise<number> {
  return photoCreditBudgetFor(plan);
}

/** Signed-in credit check. Returns remaining AFTER this job if allowed. */
export async function checkPhotoCredits(opts: {
  userId: string;
  plan: "FREE" | "PREMIUM";
  mode: PhotoMode;
}): Promise<{ ok: boolean; remaining: number; budget: number; cost: number }> {
  const cost = PHOTO_CREDIT_COST[opts.mode];
  const budget = await photoCreditBudget(opts.plan);
  const used = await photoCreditsUsedToday(opts.userId);
  const remaining = Math.max(0, budget - used - cost);
  return { ok: used + cost <= budget, remaining, budget, cost };
}

/** Guest credit check: consumes `cost` units from the per-IP bucket. */
export async function checkGuestPhotoCredits(
  req: Request,
  mode: PhotoMode
): Promise<{ ok: boolean; remaining: number; budget: number; cost: number }> {
  const cost = PHOTO_CREDIT_COST[mode];
  const budget = await photoCreditBudgetFor("FREE");
  const ip = getClientIp(req);
  let remaining = budget;
  let ok = true;
  for (let i = 0; i < cost; i++) {
    const r = await checkAiRateLimit(ip, "enhance", budget);
    remaining = r.remaining;
    if (!r.ok) {
      ok = false;
      break;
    }
  }
  return { ok, remaining, budget, cost };
}

/** Count of signed-in photo jobs today (for the account page). */
export async function countPhotoJobsToday(userId: string): Promise<number> {
  const [a, b, c] = await Promise.all([
    countJobsToday(userId, "enhance"),
    countJobsToday(userId, "colorize"),
    countJobsToday(userId, "restore"),
  ]);
  return a + b + c;
}
