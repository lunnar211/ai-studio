// SINGLE LIMITS CONFIG — the one place Free vs Premium is defined.
//
// Every page, footer, tool, and API route reads limits from here (via
// getEffectiveLimits(), which lets the admin SiteSetting values
// override the defaults without changing copy anywhere else). No page
// hardcodes a limit number in its text: if a number appears in UI copy,
// it comes from this module. Change a limit here and the whole site
// agrees.
//
// CANONICAL POLICY — FREE + UNLIMITED PHOTOS (2026-11-01, owner decision):
// - Photo jobs on FREE routes are UNLIMITED, forever, for every user
//   including guests. Free routes = browser on-device colorize (Tier A),
//   the owner's free server route (Tier B, Space), and local Sharp
//   enhance / cleanup. There is NO daily photo cap, NO credit balance,
//   and NO "will use N credits" copy on any free path.
// - Abuse protection is NOT a usage cap: the 5-requests-per-minute
//   per-IP limiter still applies to every photo route. At 5/min an IP
//   can still make thousands of uses per day — the limiter only stops
//   bursts and bots.
// - Paid-GPU jobs (image pool) bill the owner per run, so they stay
//   Premium-only: faster server processing, HD 4x up to 4096px, face
//   enhance, priority. Premium GPU jobs use the fair-use budget below
//   (100/day) — that budget is a Premium GPU guardrail, never a free
//   limit, and it never appears on free paths. Free users are NEVER
//   routed to paid GPU: when the free routes are unavailable, free
//   users get the free browser path, never a GPU bill and never a block.
// - Logo requests keep their own daily budgets (a separate capability
//   with its own provider limits): Free 10/day, Premium 100/day
//   (1 request = 3 variants).
// - Premium-only photo perks: HD 4x upscaling up to 4096px longest
//   edge, face enhance on upscales, priority generation. Free photo
//   output is up to 2x / 2048px.
// - Signing in does NOT raise free photo limits (there is no free
//   photo limit to raise): signed-in free = unlimited photos, same as
//   guests. Signing in adds history, favorites, and account features.

import { getSettings } from "./settings";

export type PhotoMode = "enhance" | "colorize" | "restore";

export const LIMITS = {
  /** True: photo jobs on free routes have no daily cap, ever. */
  photoFreeUnlimited: true,
  /**
   * Cost of a PREMIUM paid-GPU job only, in GPU-budget units.
   * Free paths NEVER charge these costs and never display them.
   */
  photoCreditCost: {
    enhance: 1,
    colorize: 2,
    restore: 3,
  } as Record<PhotoMode, number>,
  /** Premium paid-GPU fair-use budget per day (Premium only). */
  photoCreditsPremium: 100,
  logoRequestsFree: 10,
  logoRequestsPremium: 100,
  photoModeLabel: {
    enhance: "Enhance",
    colorize: "Colorize",
    restore: "Restore + Colorize",
  } as Record<PhotoMode, string>,
  /** Longest-edge cap (px) for HD output, by plan. */
  hdMaxEdge: { FREE: 2048, PREMIUM: 4096 } as Record<"FREE" | "PREMIUM", number>,
  /** Upscale scale available by plan (2x for all, 4x Premium-only). */
  hdScale: { FREE: 2, PREMIUM: 4 } as Record<"FREE" | "PREMIUM", number>,
  premiumPerks: [
    "Faster paid-GPU server processing",
    "HD 4x upscaling up to 4096px longest edge",
    "Face enhance on upscales",
    "Priority generation",
    "Saved logo history with favorites",
    "No ads",
  ],
  freePerks: [
    "Unlimited photo enhance, colorize and restore via the free routes",
    "Logo requests with 3 variants each",
    "SVG and 1024px PNG downloads",
    "No account, no payment details",
  ],
} as const;

export interface EffectiveLimits {
  photoFreeUnlimited: boolean;
  photoCreditsPremium: number;
  photoCreditCost: Record<PhotoMode, number>;
  logoRequestsFree: number;
  logoRequestsPremium: number;
}

/** Limits with admin SiteSetting overrides applied (defaults = LIMITS). */
export async function getEffectiveLimits(): Promise<EffectiveLimits> {
  const s = await getSettings();
  const num = (key: string, fallback: number): number => {
    const n = parseInt(s[key] ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    photoFreeUnlimited: true,
    // The admin "enhanceDailyPremium" setting is the Premium GPU budget.
    // There is no free photo budget anymore (free photos are unlimited).
    photoCreditsPremium: num("enhanceDailyPremium", LIMITS.photoCreditsPremium),
    photoCreditCost: { ...LIMITS.photoCreditCost },
    logoRequestsFree: num("logoDailyFree", LIMITS.logoRequestsFree),
    logoRequestsPremium: num("logoDailyPremium", LIMITS.logoRequestsPremium),
  };
}

/**
 * Premium paid-GPU budget per day. Free photos are unlimited, so this
 * is only ever consulted for Premium GPU jobs — never for free paths.
 */
export async function photoCreditBudgetFor(plan: "FREE" | "PREMIUM"): Promise<number> {
  if (plan === "FREE") return Number.POSITIVE_INFINITY;
  const l = await getEffectiveLimits();
  return l.photoCreditsPremium;
}

/** Logo request budget for a plan (uses the effective limits). */
export async function logoRequestBudgetFor(plan: "FREE" | "PREMIUM"): Promise<number> {
  const l = await getEffectiveLimits();
  return plan === "PREMIUM" ? l.logoRequestsPremium : l.logoRequestsFree;
}
