// Provider registry: which providers exist, what they can do, and
// whether each one is enabled right now.
//
// Enablement rule: a provider is enabled when (a) its server-only env key
// is present, AND (b) no admin toggle disables it. The admin toggle lives
// in SiteSetting as `ai.provider.<id>` ("true"/"false"); when the toggle
// is absent, the env key alone decides. The DB toggle wins over env, so
// an admin can kill a provider instantly without a redeploy.
//
// Hugging Face is the exception: its adapter is DISABLED by default even
// when a token is present, because the owner's stored token is known to
// return 401. It only enables when HF_ENABLED=true is set AND a token is
// present — after the owner replaces the token.
//
// Vault-key limit (owner must know): the keys the owner gave the
// assistant live in the assistant's vault and CANNOT be pasted into
// Vercel by the agent. On the live site a provider is active only after
// the owner pastes the same key into the ai-studio Vercel project and
// redeploys. Until then its adapter exists but stays disabled, and the
// router falls back honestly.

import type { AiCapability, AiPlan, AiProviderId } from "./types";

export interface ProviderDef {
  id: AiProviderId;
  /** Env var holding the key (server-only, never NEXT_PUBLIC_). */
  envKey: string;
  capabilities: AiCapability[];
  /** Human label for the admin page and the "Details" line. */
  label: string;
  /** Cost tier used for cost-aware routing. */
  cost: "free" | "cheap" | "paid";
  /** When true, the provider needs an explicit opt-in even with a key. */
  needsOptIn?: boolean;
  optInEnv?: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "groq",
    envKey: "GROQ_API_KEY",
    capabilities: ["text", "vision", "stt", "moderation-text"],
    label: "Groq",
    cost: "free",
  },
  {
    id: "gemini",
    envKey: "GEMINI_API_KEY",
    capabilities: ["text", "vision"],
    label: "Google Gemini",
    cost: "cheap",
  },
  {
    id: "openrouter",
    envKey: "OPENROUTER_API_KEY",
    capabilities: ["text", "moderation-text"],
    label: "OpenRouter",
    cost: "free",
  },
  {
    id: "nvidia",
    envKey: "NVIDIA_API_KEY",
    capabilities: ["text", "vision", "moderation-text"],
    label: "NVIDIA",
    cost: "free",
  },
  {
    id: "elevenlabs",
    envKey: "ELEVENLABS_API_KEY",
    capabilities: ["tts"],
    label: "ElevenLabs",
    cost: "paid",
  },
  {
    id: "replicate",
    envKey: "REPLICATE_API_TOKEN",
    capabilities: ["image-colorize", "image-upscale", "image-edit"],
    label: "Replicate",
    cost: "paid",
  },
  {
    id: "sharp",
    envKey: "",
    capabilities: ["image-upscale"],
    label: "Local Sharp pipeline",
    cost: "free",
  },
  {
    id: "huggingface",
    envKey: "HF_API_TOKEN",
    capabilities: ["text", "vision", "image-colorize", "image-upscale"],
    label: "Hugging Face (disabled)",
    cost: "free",
    needsOptIn: true,
    optInEnv: "HF_ENABLED",
  },
];

export function providerDef(id: AiProviderId): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Env-key presence only (no DB). Used by the capabilities endpoint. */
export function providerKeyPresent(id: AiProviderId): boolean {
  const def = providerDef(id);
  if (!def) return false;
  if (def.id === "sharp") return true;
  // Replicate's key is the IMAGE POOL (lib/ai-pool.ts): AI_API_KEYS
  // (comma-separated) with legacy REPLICATE_API_TOKEN appended. The
  // registry entry's envKey names the legacy var only, so check both.
  if (def.id === "replicate") {
    const pool = (process.env.AI_API_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean);
    return pool.length > 0 || Boolean((process.env.REPLICATE_API_TOKEN ?? "").trim());
  }
  return Boolean(def.envKey && process.env[def.envKey]);
}

/**
 * Full enablement check: env key + admin toggle + opt-in.
 * `settings` is the SiteSetting map (getSettings()); missing keys = default.
 */
export function providerEnabled(
  id: AiProviderId,
  settings: Record<string, string>
): boolean {
  const def = providerDef(id);
  if (!def) return false;
  if (def.id === "sharp") {
    const toggle = settings["ai.provider.sharp"];
    return toggle !== "false";
  }
  if (!providerKeyPresent(id)) return false;
  if (def.needsOptIn && process.env[def.optInEnv ?? ""] !== "true") return false;
  const toggle = settings[`ai.provider.${id}`];
  if (toggle === "false") return false;
  if (toggle === "true") return true;
  return true;
}

// Per-capability priority order. Free users get the free/cheap provider
// first; Premium users get the best-quality provider first. The router
// walks the list and skips disabled or circuit-tripped providers.
const PRIORITY: Record<AiCapability, { free: AiProviderId[]; premium: AiProviderId[] }> = {
  // Text: only providers with a real text adapter. NVIDIA is a vision +
  // safety provider (its chat models are not wired for plain text here).
  text: {
    free: ["groq", "openrouter", "gemini"],
    premium: ["groq", "gemini", "openrouter"],
  },
  // Vision: only providers with a real vision adapter. Groq has no
  // vision model on this key, so it is not listed (local heuristics
  // cover the gap honestly).
  vision: {
    free: ["nvidia", "gemini"],
    premium: ["gemini", "nvidia"],
  },
  "image-colorize": {
    free: ["replicate"],
    premium: ["replicate"],
  },
  "image-upscale": {
    free: ["replicate", "sharp"],
    premium: ["replicate", "sharp"],
  },
  "image-edit": {
    free: ["replicate"],
    premium: ["replicate"],
  },
  stt: {
    free: ["groq"],
    premium: ["groq"],
  },
  tts: {
    free: ["elevenlabs"],
    premium: ["elevenlabs"],
  },
  // OpenRouter is the moderation fallback: it runs only when NVIDIA
  // fails (Groq has no classifier adapter, so the router skips it).
  "moderation-text": {
    free: ["nvidia", "groq", "openrouter"],
    premium: ["nvidia", "groq", "openrouter"],
  },
  "moderation-image": {
    free: [],
    premium: [],
  },
};

export function priorityFor(capability: AiCapability, plan: AiPlan): AiProviderId[] {
  const entry = PRIORITY[capability];
  return plan === "PREMIUM" ? entry.premium : entry.free;
}
