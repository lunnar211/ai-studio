// Public capability flags for the photo tools: booleans ONLY — never
// a key, a model list, or anything that reveals configuration. The UI
// uses these to show honest states (e.g. "Colorize is unavailable
// right now" when Replicate is not configured) instead of dead buttons.

import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { providerEnabled, providerKeyPresent } from "@/lib/ai/registry";
import { LIMITS } from "@/lib/limits";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({
    colorize: providerEnabled("replicate", settings),
    upscaleAi: providerEnabled("replicate", settings),
    upscaleLocal: true,
    visionAnalysis: providerEnabled("gemini", settings) || providerEnabled("nvidia", settings),
    moderationText: providerEnabled("nvidia", settings),
    // Key presence is reported only as "configured" booleans for the
    // admin-facing honesty note; no values are ever exposed.
    replicateConfigured: providerKeyPresent("replicate"),
    photoCreditsFree: LIMITS.photoCreditsFree,
    photoCreditsPremium: LIMITS.photoCreditsPremium,
    photoCreditCost: LIMITS.photoCreditCost,
  });
}
