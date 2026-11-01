// Daily budget for raster image generation — the guard that keeps
// paid generation from draining the owner's balance.
//
// WHY THIS EXISTS (read before changing it): unlike the site's
// free routes (local Sharp, the owner's free Space) and unlike
// logos (Groq text, ~free), EVERY image-generation provider bills
// the owner per image (Gemini per image, fal.ai per generation).
// Generation is therefore NOT unlimited and NOT guest-accessible:
// the route requires sign-in, and each signed-in user gets a daily
// budget below. This is a deliberate exception to the site's
// "free unlimited" photo/logo policy, which covers only routes
// that cost the owner nothing. Do not raise these numbers without
// the owner accepting the per-image bill that comes with it.
//
// Counting: AiUsageLog rows with capability "image-generate" and
// success=true today, falling back to Job rows (tool "generate",
// status SUCCESS) when the usage table is missing — the same
// degrade-honestly pattern as lib/ai/credits.ts. When there is no
// database at all (prisma null) the count is UNKNOWN (null) and
// the route fails closed: an uncounted paid feature must not run.

import { prisma } from "../../prisma";

/** Images per user per day, by plan. 1 credit per image. */
export const GENERATE_DAILY_BUDGET = { FREE: 10, PREMIUM: 100 } as const;

/** Credits charged per generated image. */
export const GENERATE_COST = 1;

/**
 * Generations used today by this user, or null when counting is
 * impossible (no database). Never throws.
 */
export async function countGenerationsToday(userId: string): Promise<number | null> {
  if (!prisma) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  try {
    const rows = await prisma.aiUsageLog.findMany({
      where: { userId, createdAt: { gte: start }, capability: "image-generate", success: true },
      select: { credits: true },
    });
    if (rows.length > 0) {
      return rows.reduce((sum, r) => sum + (r.credits || GENERATE_COST), 0);
    }
  } catch {
    // Usage table missing (schema not pushed): fall through to Job rows.
  }
  try {
    return await prisma.job.count({
      where: { userId, tool: "generate", status: "SUCCESS", createdAt: { gte: start } },
    });
  } catch {
    return 0;
  }
}

/**
 * Daily-budget check. Returns remaining AFTER this image if
 * allowed. When counting is impossible (null), ok=false: the
 * route answers "unavailable" rather than running uncounted paid
 * generations.
 */
export async function checkGenerateBudget(opts: {
  userId: string;
  plan: "FREE" | "PREMIUM";
}): Promise<{ ok: boolean; remaining: number; budget: number; used: number | null }> {
  const budget = GENERATE_DAILY_BUDGET[opts.plan];
  const used = await countGenerationsToday(opts.userId);
  if (used === null) {
    return { ok: false, remaining: 0, budget, used: null };
  }
  return { ok: used + GENERATE_COST <= budget, remaining: Math.max(0, budget - used - GENERATE_COST), budget, used };
}
