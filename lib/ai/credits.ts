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
import { applyAdjustments } from "../admin-audit";

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

// SUITE Phase 1: recorded budget deltas for one user (grants +, removals
// −). Missing table (schema not pushed) degrades to zero — an unpushed
// schema must never invent budget, and never block on a missing table.
export async function creditAdjustmentsTotal(userId: string): Promise<number> {
  if (!prisma) return 0;
  try {
    const agg = await prisma.creditAdjustment.aggregate({
      where: { userId },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  } catch {
    return 0;
  }
}

// SUITE Phase 1: a Premium user's effective GPU budget = plan budget +
// adjustments (floored at zero). FREE users have no GPU budget at all —
// free routes never touch this module — so this is only called for
// PREMIUM callers and the user panel's Premium section.
export async function effectivePhotoBudget(
  plan: "FREE" | "PREMIUM",
  userId: string
): Promise<{ budget: number; adjustments: number }> {
  const base = await photoCreditBudget(plan);
  const adjustments = await creditAdjustmentsTotal(userId);
  return { budget: applyAdjustments(base, adjustments), adjustments };
}

// SUITE Phase 1: one honest budget picture for the user panel — budget,
// today's usage, adjustments, and what is left. FREE callers get
// applies: false (there is no GPU budget to picture on free routes).
export async function photoBudgetSummary(
  userId: string,
  plan: "FREE" | "PREMIUM"
): Promise<
  | { applies: false }
  | { applies: true; budget: number; used: number; adjustments: number; remaining: number }
> {
  if (plan === "FREE") return { applies: false };
  const [{ budget, adjustments }, used] = await Promise.all([
    effectivePhotoBudget(plan, userId),
    photoCreditsUsedToday(userId),
  ]);
  return { applies: true, budget, used, adjustments, remaining: Math.max(0, budget - used) };
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
  // SUITE Phase 1: the check honors recorded adjustments, so a grant
  // really does raise the budget and a removal really does lower it.
  const { budget } = await effectivePhotoBudget(opts.plan, opts.userId);
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
