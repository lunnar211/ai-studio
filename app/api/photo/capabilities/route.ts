// Public capability flags for the photo tools: booleans ONLY — never
// a key, a model list, or anything that reveals configuration. The UI
// uses these to show honest states (e.g. "Colorize is unavailable
// right now" when Replicate is not configured, or when the PhotoJob
// table has not been pushed yet) instead of dead buttons.
//
// Colorize additionally requires the PhotoJob table: async jobs have
// nowhere to live without it, so the endpoint probes the table (one
// cheap query, errors swallowed) and reports colorize as unavailable
// until the owner's one-time prisma db push creates it.

import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { providerEnabled, providerKeyPresent } from "@/lib/ai/registry";
import { LIMITS } from "@/lib/limits";
import { getSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { photoCreditsUsedToday } from "@/lib/ai/credits";
import { spaceConfigured } from "@/lib/ai/gradio";

export const dynamic = "force-dynamic";

async function photoJobTableReady(): Promise<boolean> {
  if (!prisma) return false;
  try {
    await prisma.photoJob.findFirst({ select: { id: true } });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const settings = await getSettings();
  const replicateOn = providerEnabled("replicate", settings);
  // Space kill-switch: the admin toggle disables it instantly without
  // a redeploy (the registry's HF Inference adapter is separate and
  // stays disabled).
  const spaceOn = spaceConfigured() && settings["ai.provider.huggingface"] !== "false";
  const tableReady = await photoJobTableReady();
  const session = await getSessionSafe();
  const userId = (session?.user as unknown as { id?: string; plan?: string } | undefined)?.id ?? null;
  const userPlan = (session?.user as unknown as { plan?: string } | undefined)?.plan === "PREMIUM" ? "PREMIUM" : "FREE";

  let remainingCredits: number | null = null;
  let creditBudget: number | null = null;
  if (userId) {
    const budget = userPlan === "PREMIUM" ? LIMITS.photoCreditsPremium : LIMITS.photoCreditsFree;
    const used = await photoCreditsUsedToday(userId);
    creditBudget = budget;
    remainingCredits = Math.max(0, budget - used);
  }

  return NextResponse.json({
    colorize: (replicateOn || spaceOn) && tableReady,
    colorizeBlockedReason: !(replicateOn || spaceOn)
      ? "Neither the image model nor your private Space is configured."
      : !tableReady
        ? "Photo jobs need a one-time database setup that has not run yet."
        : null,
    spaceConfigured: spaceOn,
    browserColorize: true,
    upscaleAi: replicateOn,
    upscaleLocal: true,
    visionAnalysis: providerEnabled("gemini", settings) || providerEnabled("nvidia", settings),
    moderationText: providerEnabled("nvidia", settings),
    replicateConfigured: providerKeyPresent("replicate"),
    photoCreditsFree: LIMITS.photoCreditsFree,
    photoCreditsPremium: LIMITS.photoCreditsPremium,
    photoCreditCost: LIMITS.photoCreditCost,
    // Signed-in only (guests cannot be peeked with Upstash, so the UI
    // shows the budget without a remaining count for guests).
    signedIn: Boolean(userId),
    plan: userId ? userPlan : null,
    remainingCredits,
    creditBudget,
  });
}
