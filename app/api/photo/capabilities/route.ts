// Public capability flags for the photo tools: booleans ONLY — never
// a key, a model list, a provider name, or anything that reveals
// configuration (P0 fix). The UI uses these to show honest states
// and to offer the free browser path first when the server is
// unavailable, instead of dead buttons.
//
// Colorize additionally requires the PhotoJob table: async jobs have
// nowhere to live without it, so the endpoint probes the table (one
// cheap query, errors swallowed) and reports colorize as unavailable
// until the owner's one-time prisma db push creates it.
//
// FREE + UNLIMITED model: server availability is per-plan, because
// free users may only use the free server route (Space) while Premium
// users may also use the fast paid-GPU route. No credit balances are
// returned for free paths (there are none); Premium GPU remaining is
// returned only for signed-in Premium users.

import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { providerEnabled } from "@/lib/ai/registry";
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
  const serverAiOn = providerEnabled("replicate", settings);
  // Server colorize kill-switch: the admin toggle disables it
  // instantly without a redeploy (the registry's HF Inference adapter
  // is separate and stays disabled).
  const spaceOn = spaceConfigured() && settings["ai.provider.huggingface"] !== "false";
  const tableReady = await photoJobTableReady();
  const session = await getSessionSafe();
  const userId = (session?.user as unknown as { id?: string; plan?: string } | undefined)?.id ?? null;
  const userPlan = (session?.user as unknown as { plan?: string } | undefined)?.plan === "PREMIUM" ? "PREMIUM" : "FREE";

  // Per-plan server availability: FREE = free server route only;
  // PREMIUM = fast paid-GPU route or the free server route.
  const serverColorize = userPlan === "PREMIUM" ? (serverAiOn || spaceOn) && tableReady : spaceOn && tableReady;

  // Premium GPU remaining (signed-in Premium only). Free paths have
  // no balance to report — free photos are unlimited.
  let premiumGpuRemaining: number | null = null;
  if (userId && userPlan === "PREMIUM") {
    const used = await photoCreditsUsedToday(userId);
    premiumGpuRemaining = Math.max(0, LIMITS.photoCreditsPremium - used);
  }

  return NextResponse.json({
    colorize: serverColorize,
    // Generic reason only — never which tier is missing or why.
    colorizeBlockedReason: !serverColorize ? "Colorize is unavailable right now." : null,
    serverColorize,
    browserColorize: true,
    // Free photos are unlimited via the free routes (browser + free
    // server). The UI shows "Free — unlimited", never a credit count.
    freeUnlimited: true,
    // Neutral flag: the fast server path is available for Premium.
    // It names no provider, model, or setting.
    premiumSpeed: userPlan === "PREMIUM" && serverAiOn,
    upscaleAi: serverAiOn,
    upscaleLocal: true,
    signedIn: Boolean(userId),
    plan: userId ? userPlan : null,
    premiumGpuRemaining,
  });
}
