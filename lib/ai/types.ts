// Multi-provider AI layer: shared types for /lib/ai/.
//
// Every provider adapter implements only the capabilities it actually
// supports. The router (router.ts) picks candidates per capability and
// falls back on failure — it never fabricates a result. Keys are read
// from server-only env vars; nothing in this folder ever runs in the
// browser, and no key value is ever logged or returned to the client.

export type AiCapability =
  | "text"
  | "vision"
  | "image-colorize"
  | "image-upscale"
  | "image-edit"
  | "image-generate"
  | "stt"
  | "tts"
  | "moderation-text"
  | "moderation-image";

export type AiPlan = "FREE" | "PREMIUM";

export type AiProviderId =
  | "groq"
  | "gemini"
  | "openrouter"
  | "nvidia"
  | "elevenlabs"
  | "replicate"
  | "fal"
  | "sharp"
  | "huggingface";

export interface AiTextResult {
  text: string;
  provider: AiProviderId;
  model: string;
  latencyMs: number;
}

export interface AiVisionAnalysis {
  /** True when the image is effectively grayscale (low chroma). */
  isGrayscale: boolean;
  /** Estimated face count, when the provider reports one; null = unknown. */
  faceCount: number | null;
  /** "low" | "medium" | "high" | null — noise/blur/damage estimates. */
  noiseLevel: "low" | "medium" | "high" | null;
  blurLevel: "low" | "medium" | "high" | null;
  damageLevel: "low" | "medium" | "high" | null;
  /** Era guess from clothing/style, e.g. "1950s-1970s"; null = unknown. */
  eraGuess: string | null;
  /** Plain-language pipeline suggestion, e.g. "Colorize + HD". */
  recommendation: string;
  /** Short human-readable notes (never raw scores). */
  notes: string[];
  provider: AiProviderId;
  model: string;
  /** True when this analysis came from local heuristics, not an AI model. */
  heuristicOnly: boolean;
}

export interface AiImageResult {
  /** Final image bytes (already post-processed by the caller if needed). */
  buffer: Buffer;
  /** "ai" for a model result, "sharp" for the local pipeline. */
  engine: "ai" | "sharp";
  provider: AiProviderId;
  model: string;
  width: number;
  height: number;
  /** Replicate prediction id, when applicable (for cost tracing). */
  predictionId?: string;
  /** Seconds the model spent predicting (Replicate metrics), when known. */
  predictTimeSeconds?: number;
}

export interface AiModerationResult {
  /** True = the content looks unsafe and the request must be refused. */
  flagged: boolean;
  /** Categories the provider reported (empty when unavailable). */
  categories: string[];
  provider: AiProviderId;
  model: string;
}

export interface AiUsageEntry {
  provider: AiProviderId;
  model: string;
  capability: AiCapability;
  latencyMs: number;
  success: boolean;
  /** Estimated USD cost. 0 for free-tier/local providers. */
  costUsd: number;
  /** Photo credits consumed by this job (0 for non-photo jobs). */
  credits?: number;
  userId?: string | null;
}

export class AiError extends Error {
  /** Machine-readable code for logs; the user-facing message stays honest. */
  code: string;
  /** HTTP status the caller should use. */
  status: number;
  /** True when the provider answered 429 (rate limited). */
  rateLimited: boolean;

  constructor(code: string, message: string, status = 502, rateLimited = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.rateLimited = rateLimited;
  }
}

/** Error shown when no provider for a capability is configured. */
export function notConfiguredError(capability: AiCapability): AiError {
  return new AiError(
    "AI_NOT_CONFIGURED",
    `That AI feature is not configured yet. The site owner needs to add the provider key first.`,
    503
  );
}
