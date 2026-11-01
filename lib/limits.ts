// SINGLE LIMITS CONFIG — the one place Free vs Premium is defined.
//
// Every page, footer, tool, and API route reads limits from here (via
// getEffectiveLimits(), which lets the admin SiteSetting values
// override the defaults without changing copy anywhere else). No page
// hardcodes a limit number in its text: if a number appears in UI copy,
// it comes from this module. Change a limit here and the whole site
// agrees.
//
// Canonical policy (Phase 2 decision, implemented everywhere):
// - Photo credits: Free 10/day, Premium 100/day.
//   Enhance = 1 credit, Colorize = 2, Restore + Colorize = 3.
//   (P0: exactly 3 modes. Colorize now always includes the upscale
//   step, so it keeps its old 2-credit price; Restore + Colorize
//   adds a restoration pass first, so it costs 3.)
// - Logo requests: Free 10/day, Premium 100/day (1 request = 3 variants).
// - Premium-only: HD 4x up to 4096px longest edge, face enhance,
//   priority generation. Free users get up to 2x / 2048px.
// - Signing in does NOT raise free limits: signed-in free = same 10/day
//   as guests. Signing in adds history, favorites, and account features.

import { getSettings } from "./settings";

export type PhotoMode = "enhance" | "colorize" | "restore";

export const LIMITS = {
  photoCreditsFree: 10,
  photoCreditsPremium: 100,
  logoRequestsFree: 10,
  logoRequestsPremium: 100,
  photoCreditCost: {
    enhance: 1,
    colorize: 2,
    restore: 3,
  } as Record<PhotoMode, number>,
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
    "HD 4x upscaling up to 4096px longest edge",
    "Face enhance on upscales",
    "Priority generation",
    "Saved logo history with favorites",
    "No ads",
  ],
  freePerks: [
    "Logo requests with 3 variants each",
    "Photo enhance, colorize and restore within credits",
    "SVG and 1024px PNG downloads",
    "No account, no payment details",
  ],
} as const;

export interface EffectiveLimits {
  photoCreditsFree: number;
  photoCreditsPremium: number;
  logoRequestsFree: number;
  logoRequestsPremium: number;
  photoCreditCost: Record<PhotoMode, number>;
}

/** Limits with admin SiteSetting overrides applied (defaults = LIMITS). */
export async function getEffectiveLimits(): Promise<EffectiveLimits> {
  const s = await getSettings();
  const num = (key: string, fallback: number): number => {
    const n = parseInt(s[key] ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    photoCreditsFree: num("enhanceDailyFree", LIMITS.photoCreditsFree),
    photoCreditsPremium: num("enhanceDailyPremium", LIMITS.photoCreditsPremium),
    logoRequestsFree: num("logoDailyFree", LIMITS.logoRequestsFree),
    logoRequestsPremium: num("logoDailyPremium", LIMITS.logoRequestsPremium),
    photoCreditCost: { ...LIMITS.photoCreditCost },
  };
}

/** Photo credit budget for a plan (uses the effective limits). */
export async function photoCreditBudgetFor(plan: "FREE" | "PREMIUM"): Promise<number> {
  const l = await getEffectiveLimits();
  return plan === "PREMIUM" ? l.photoCreditsPremium : l.photoCreditsFree;
}

/** Logo request budget for a plan (uses the effective limits). */
export async function logoRequestBudgetFor(plan: "FREE" | "PREMIUM"): Promise<number> {
  const l = await getEffectiveLimits();
  return plan === "PREMIUM" ? l.logoRequestsPremium : l.logoRequestsFree;
}
