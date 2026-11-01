// Photo GPU-budget accounting — reads the SINGLE limits config
// (lib/limits.ts); this module only implements the accounting, it does
// not define any number.
//
// FREE + UNLIMITED MODEL (2026-11-01): photo jobs on free routes
// (browser, Space, Sharp) NEVER consume anything here. This module
// exists only for Premium paid-GPU jobs, which draw from the Premium
// GPU fair-use budget. Signed-in Premium usage = sum of AiUsageLog
// credits for photo jobs, falling back to Job rows when the usage
// table does not exist yet (schema not pushed). Guests never reach
// this module for photos: guests are always on free routes, and the
// only guest gate is the 5/min per-IP limiter (not a credit bucket).

import { prisma } from "../prisma";
import { countJobsToday } from "../settings";
import {
  LIMITS,
  photoCreditBudgetFor,
  type PhotoMode,
} from "../limits";

export type { PhotoMode };
/** Premium paid-GPU cost per mode. Free paths never charge this. */
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

/**
 * Premium paid-GPU budget check. Returns remaining AFTER this job if
 * allowed. FREE callers always pass with cost 0 — free jobs must never
 * be blocked by this check (routes bypass it entirely for free paths;
 * this guard exists so a mistaken call cannot block a free user).
 */
export async function checkPhotoCredits(opts: {
  userId: string;
  plan: "FREE" | "PREMIUM";
  mode: PhotoMode;
}): Promise<{ ok: boolean; remaining: number; budget: number; cost: number }> {
  if (opts.plan === "FREE") {
    return { ok: true, remaining: Number.POSITIVE_INFINITY, budget: Number.POSITIVE_INFINITY, cost: 0 };
  }
  const cost = PHOTO_CREDIT_COST[opts.mode];
  const budget = await photoCreditBudget(opts.plan);
  const used = await photoCreditsUsedToday(opts.userId);
  const remaining = Math.max(0, budget - used - cost);
  return { ok: used + cost <= budget, remaining, budget, cost };
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
