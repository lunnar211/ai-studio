// Content safety, stated honestly.
//
// What IS checked:
// - Prompt text: the blocklist (brands/celebrities/disallowed content)
//   plus prompt-injection cleaning, both in lib/logo.ts and lib/blocklist.
// - Hint text: the router's text moderation (NVIDIA NeMo Guard first,
//   OpenRouter chat classification as fallback) when a key for either
//   is configured; otherwise no external text check runs.
// What is NOT checked (no provider for it is configured):
// - Image NSFW / illegal-content classification. No image-moderation
//   model exists in any configured provider's catalogue (NVIDIA's list
//   has text safety models only; Replicate needs a token and no NSFW
//   model slug has been verified). The photo routes therefore do NOT
//   claim an image check: they validate file type/size, enforce rate
//   limits, and suspend abusive accounts, and the Acceptable Use page
//   says plainly that no automated image-content check runs. Adding a
//   verified image-moderation model later is a one-adapter change.

import { routeModerationText } from "./router";

export interface SafetyCheck {
  /** True when the request must be refused. */
  refused: boolean;
  /** True when an external moderation provider actually ran. */
  checked: boolean;
  /** User-facing refusal message (empty when not refused). */
  message: string;
}

/** Check hint/prompt text. Blocklist hits are handled by the caller. */
export async function checkHintText(text: string): Promise<SafetyCheck> {
  if (!text.trim()) return { refused: false, checked: false, message: "" };
  const result = await routeModerationText({ text });
  if (!result.checked) {
    return { refused: false, checked: false, message: "" };
  }
  if (result.flagged) {
    return {
      refused: true,
      checked: true,
      message: "That description was refused by the content-safety check. Please describe the colours differently.",
    };
  }
  return { refused: false, checked: true, message: "" };
}

/** Availability report for the capabilities endpoint (booleans only). */
export async function moderationAvailability(): Promise<{
  textModeration: boolean;
  imageModeration: boolean;
}> {
  const settings = await import("../settings").then((m) => m.getSettings());
  const { providerEnabled } = await import("./registry");
  return {
    textModeration: providerEnabled("nvidia", settings) || providerEnabled("openrouter", settings),
    imageModeration: false,
  };
}
