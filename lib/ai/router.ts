// AI router: per-capability routing with timeout, 1 retry (inside the
// adapters), automatic fallback to the next provider, a circuit breaker,
// and cost-aware ordering (free/cheap first for free users, best
// quality first for Premium). Every attempt is usage-logged; a failed
// provider never produces a fake result — the router either returns a
// real result or throws an honest AiError.

import { getSettings } from "../settings";
import { isTripped, recordFailure, recordSuccess } from "./circuit";
import { logAiUsage } from "./usage";
import { priorityFor, providerDef, providerEnabled } from "./registry";
import { groqChat, groqTranscribe } from "./adapters/groq";
import { geminiChat, geminiAnalyzePhoto } from "./adapters/gemini";
import { openrouterChat } from "./adapters/openrouter";
import { nvidiaAnalyzePhoto, nvidiaModerateText } from "./adapters/nvidia";
import { elevenlabsSpeak } from "./adapters/elevenlabs";
import { huggingfaceDisabled } from "./adapters/huggingface";
import {
  REPLICATE_COLORIZE_MODEL,
  REPLICATE_COLORIZE_VERSION,
  REPLICATE_UPSCALE_MODEL,
  REPLICATE_UPSCALE_VERSION,
  replicateCostEstimate,
  replicateFetchOutput,
  replicateGet,
  replicateOutputUrl,
  replicateStart,
  type ReplicatePrediction,
} from "./adapters/replicate";
import { checkSpendCap } from "./usage";
import { sharpEnhance } from "./adapters/sharp-local";
import sharp from "sharp";
import {
  AiError,
  notConfiguredError,
  type AiCapability,
  type AiModerationResult,
  type AiPlan,
  type AiProviderId,
  type AiTextResult,
  type AiVisionAnalysis,
} from "./types";

// Re-exported so routes can type-narrow router errors without
// importing the types module separately.
export { AiError } from "./types";

async function enabledCandidates(
  capability: AiCapability,
  plan: AiPlan
): Promise<AiProviderId[]> {
  const settings = await getSettings();
  return priorityFor(capability, plan).filter((id) => {
    if (isTripped(id)) return false;
    return providerEnabled(id, settings);
  });
}

/** Public helper for routes: is any provider for this capability enabled? */
export async function anyProviderEnabled(
  capability: AiCapability,
  plan: AiPlan = "FREE"
): Promise<boolean> {
  return (await enabledCandidates(capability, plan)).length > 0;
}

async function log(
  provider: AiProviderId,
  model: string,
  capability: AiCapability,
  latencyMs: number,
  success: boolean,
  costUsd: number,
  userId?: string | null,
  credits?: number
): Promise<void> {
  await logAiUsage({ provider, model, capability, latencyMs, success, costUsd, userId, credits: credits ?? 0 });
}

/** Generic text completion through the router. */
export async function routeText(opts: {
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  plan?: AiPlan;
  userId?: string | null;
  timeoutMs?: number;
  /** Force one provider (used by the logo route's diversity round). */
  onlyProvider?: AiProviderId;
  /** Force one model on the chosen provider (logo fallback round). */
  model?: string;
}): Promise<AiTextResult> {
  const plan = opts.plan ?? "FREE";
  const candidates = opts.onlyProvider
    ? [opts.onlyProvider]
    : await enabledCandidates("text", plan);
  let lastError: AiError | null = null;
  for (const provider of candidates) {
    const started = Date.now();
    try {
      let result: AiTextResult;
      if (provider === "groq") {
        result = await groqChat({ system: opts.system, user: opts.user, temperature: opts.temperature, maxTokens: opts.maxTokens, timeoutMs: opts.timeoutMs, model: opts.model });
      } else if (provider === "gemini") {
        result = await geminiChat({ system: opts.system, user: opts.user, timeoutMs: opts.timeoutMs });
      } else if (provider === "openrouter") {
        result = await openrouterChat({ system: opts.system, user: opts.user, temperature: opts.temperature, maxTokens: opts.maxTokens, timeoutMs: opts.timeoutMs, model: opts.model });
      } else {
        continue;
      }
      recordSuccess(provider);
      await log(provider, result.model, "text", result.latencyMs, true, provider === "gemini" ? 0.001 : 0, opts.userId);
      return result;
    } catch (err) {
      const e = err instanceof AiError ? err : new AiError("AI_FAILED", "AI request failed.", 502);
      recordFailure(provider, e.rateLimited);
      await log(provider, providerDef(provider)?.label ?? provider, "text", Date.now() - started, false, 0, opts.userId);
      lastError = e;
    }
  }
  if (lastError && lastError.code === "AI_NOT_CONFIGURED") throw lastError;
  if (candidates.length === 0) throw notConfiguredError("text");
  throw lastError ?? new AiError("AI_FAILED", "No AI provider could answer.", 502);
}

/** Local facts the caller already measured (no AI involved). */
export interface LocalVisionFacts {
  isGrayscale: boolean;
  faceCount: null;
  noiseLevel: "low" | "medium" | "high" | null;
  blurLevel: "low" | "medium" | "high" | null;
  damageLevel: "low" | "medium" | "high" | null;
  eraGuess: string | null;
  recommendation: string;
  notes: string[];
}

/** Vision analysis: AI provider first, local heuristics when none is set. */
export async function routeVision(opts: {
  image: Buffer;
  mime: string;
  plan?: AiPlan;
  userId?: string | null;
  timeoutMs?: number;
  /** Local fallback analysis (already computed by the caller). */
  local: LocalVisionFacts;
}): Promise<AiVisionAnalysis> {
  const plan = opts.plan ?? "FREE";
  const candidates = await enabledCandidates("vision", plan);
  let lastError: AiError | null = null;
  for (const provider of candidates) {
    const started = Date.now();
    try {
      let result: AiVisionAnalysis;
      if (provider === "gemini") {
        result = await geminiAnalyzePhoto({
          image: opts.image,
          mime: opts.mime,
          question: "Analyse this photo and answer ONLY as JSON: {\"isGrayscale\": boolean, \"faceCount\": number|null, \"noiseLevel\": \"low\"|\"medium\"|\"high\"|null, \"blurLevel\": \"low\"|\"medium\"|\"high\"|null, \"damageLevel\": \"low\"|\"medium\"|\"high\"|null, \"eraGuess\": string|null, \"recommendation\": string, \"notes\": [max 4 short notes]}",
          timeoutMs: opts.timeoutMs,
        });
      } else if (provider === "nvidia") {
        result = await nvidiaAnalyzePhoto({ image: opts.image, mime: opts.mime, timeoutMs: opts.timeoutMs });
      } else {
        continue;
      }
      recordSuccess(provider);
      await log(provider, result.model, "vision", Date.now() - started, true, provider === "gemini" ? 0.001 : 0, opts.userId);
      return result;
    } catch (err) {
      const e = err instanceof AiError ? err : new AiError("AI_FAILED", "Vision analysis failed.", 502);
      recordFailure(provider, e.rateLimited);
      await log(provider, provider, "vision", Date.now() - started, false, 0, opts.userId);
      lastError = e;
    }
  }
  void lastError;
  // Honest fallback: local facts only, clearly marked heuristic-only.
  return {
    ...opts.local,
    provider: "sharp",
    model: "local-heuristics",
    heuristicOnly: true,
  };
}

/** Speech-to-text (Groq Whisper only — the one verified STT provider). */
export async function routeStt(opts: {
  audio: Buffer;
  filename: string;
  mime: string;
  userId?: string | null;
  timeoutMs?: number;
}): Promise<AiTextResult> {
  const settings = await getSettings();
  if (!providerEnabled("groq", settings)) throw notConfiguredError("stt");
  if (isTripped("groq")) throw new AiError("AI_BUSY", "Speech recognition is busy right now. Please try again shortly.", 503);
  try {
    const result = await groqTranscribe({ audio: opts.audio, filename: opts.filename, mime: opts.mime, timeoutMs: opts.timeoutMs });
    recordSuccess("groq");
    await log("groq", result.model, "stt", result.latencyMs, true, 0, opts.userId);
    return result;
  } catch (err) {
    const e = err instanceof AiError ? err : new AiError("AI_FAILED", "Transcription failed.", 502);
    recordFailure("groq", e.rateLimited);
    await log("groq", "whisper", "stt", 0, false, 0, opts.userId);
    throw e;
  }
}

/** Text-to-speech (ElevenLabs only — adapter ready, no UI feature yet). */
export async function routeTts(opts: {
  text: string;
  voiceId?: string;
  userId?: string | null;
}): Promise<{ audio: Buffer; provider: "elevenlabs"; model: string }> {
  const settings = await getSettings();
  if (!providerEnabled("elevenlabs", settings)) throw notConfiguredError("tts");
  return elevenlabsSpeak({ text: opts.text, voiceId: opts.voiceId });
}

/**
 * Text moderation. Returns flagged=false when no moderation provider is
 * configured — the caller must NOT claim a check happened in that case
 * (see moderation.ts, which reports availability separately).
 */
export async function routeModerationText(opts: {
  text: string;
  userId?: string | null;
}): Promise<AiModerationResult & { checked: boolean }> {
  const settings = await getSettings();
  const candidates = (await enabledCandidates("moderation-text", "FREE")).filter(
    (id) => providerEnabled(id, settings)
  );
  for (const provider of candidates) {
    try {
      if (provider === "nvidia") {
        const r = await nvidiaModerateText({ text: opts.text });
        recordSuccess(provider);
        return { ...r, checked: true };
      }
      // Groq prompt-guard models are classifiers, not chat models; the
      // Groq adapter does not expose them. NVIDIA is the text-safety
      // provider; Groq's role here is the prompt-injection cleanPrompt
      // in lib/logo.ts, which runs separately.
      continue;
    } catch {
      recordFailure(provider, false);
    }
  }
  return { flagged: false, categories: [], provider: "sharp", model: "none", checked: false };
}

/** Hugging Face: always disabled until the owner replaces the token. */
export function routeHuggingface(): never {
  throw huggingfaceDisabled();
}

// ---------------------------------------------------------------------------
// Replicate image jobs (colorize / upscale). These are NOT generic text
// routes: they start async predictions, and the caller polls. Spend-cap
// and usage logging apply; the Sharp fallback lives in the caller, so a
// Replicate failure here never produces a fake colour or a fake upscale.
// ---------------------------------------------------------------------------

export interface UpscaleJob {
  engine: "ai" | "sharp";
  buffer: Buffer;
  provider: AiProviderId;
  model: string;
  width: number;
  height: number;
  costUsd: number;
}

/**
 * Synchronous upscale for the existing enhance route: Replicate first
 * (when configured and under the spend cap), Sharp fallback otherwise.
 * The caller labels the result honestly from `engine`.
 */
export async function routeUpscale(opts: {
  image: Buffer;
  kind: string;
  scale?: number;
  faceEnhance?: boolean;
  userId?: string | null;
  plan?: AiPlan;
}): Promise<UpscaleJob> {
  const allSettings = await getSettings();
  const replicateOn = providerEnabled("replicate", allSettings) && !isTripped("replicate");
  if (replicateOn) {
    const cap = await checkSpendCap();
    if (cap.ok) {
      try {
        const mime = opts.kind === "png" ? "image/png" : opts.kind === "webp" ? "image/webp" : "image/jpeg";
        const dataUri = `data:${mime};base64,${opts.image.toString("base64")}`;
        const started = Date.now();
        const predId = await replicateStart({
          model: REPLICATE_UPSCALE_MODEL,
          version: REPLICATE_UPSCALE_VERSION,
          input: {
            image: dataUri,
            scale: opts.scale ?? 2,
            face_enhance: opts.faceEnhance ?? false,
          },
        });
        // Poll synchronously (existing enhance behaviour, 50s budget).
        const deadline = Date.now() + 50000;
        let pred: ReplicatePrediction = await replicateGet(predId);
        while (pred.status === "starting" || pred.status === "processing") {
          if (Date.now() > deadline) throw new AiError("REPLICATE_TIMEOUT", "Replicate took too long.", 502);
          await new Promise((r) => setTimeout(r, 2500));
          pred = await replicateGet(predId);
        }
        if (pred.status === "succeeded") {
          const url = replicateOutputUrl(pred);
          if (url) {
            const buf = await replicateFetchOutput(url);
            const meta = await sharp(buf).metadata();
            const cost = replicateCostEstimate(pred);
            recordSuccess("replicate");
            await log("replicate", REPLICATE_UPSCALE_MODEL, "image-upscale", Date.now() - started, true, cost, opts.userId, 1);
            return {
              engine: "ai",
              buffer: buf,
              provider: "replicate",
              model: REPLICATE_UPSCALE_MODEL,
              width: meta.width ?? 0,
              height: meta.height ?? 0,
              costUsd: cost,
            };
          }
        }
        recordFailure("replicate", false);
        await log("replicate", REPLICATE_UPSCALE_MODEL, "image-upscale", Date.now() - started, false, 0, opts.userId);
      } catch (err) {
        if (err instanceof AiError) recordFailure("replicate", err.rateLimited);
        else recordFailure("replicate", false);
        // Fall through to Sharp — never a fake AI label.
      }
    }
  }
  const startedSharp = Date.now();
  const out = await sharpEnhance(opts.image);
  const meta = await sharp(out).metadata();
  // The Sharp fallback is still a completed photo job: log it with 1
  // credit so AiUsageLog stays the single source of truth for photo
  // credits (otherwise Sharp jobs would be invisible to the budget
  // once any AI usage rows exist).
  await log("sharp", "sharp-lanczos3", "image-upscale", Date.now() - startedSharp, true, 0, opts.userId, 1);
  return {
    engine: "sharp",
    buffer: out,
    provider: "sharp",
    model: "sharp-lanczos3",
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    costUsd: 0,
  };
}

/** Start an async DDColor colorize prediction. Returns its id. */
/**
 * Start an async Replicate colorize prediction. Like routeUpscale, this
 * does NOT write a usage row — the caller logs once at completion with
 * the real outcome. The caller owns the LAB merge, the intensity
 * scaling, and the honest "unavailable" message when Replicate is down
 * or unconfigured.
 */
export async function routeColorizeStart(opts: {
  image: Buffer;
  kind: string;
  userId?: string | null;
}): Promise<{ predictionId: string }> {
  const allSettings = await getSettings();
  if (!providerEnabled("replicate", allSettings) || isTripped("replicate")) {
    throw notConfiguredError("image-colorize");
  }
  const cap = await checkSpendCap();
  if (!cap.ok) {
    throw new AiError(
      "AI_BUDGET_REACHED",
      `The daily AI budget ($${cap.cap}) is reached. Colorize will be available again tomorrow.`,
      503
    );
  }
  const mime = opts.kind === "png" ? "image/png" : opts.kind === "webp" ? "image/webp" : "image/jpeg";
  const dataUri = `data:${mime};base64,${opts.image.toString("base64")}`;
  try {
    const id = await replicateStart({
      model: REPLICATE_COLORIZE_MODEL,
      version: REPLICATE_COLORIZE_VERSION,
      input: { image: dataUri, model_size: "large" },
    });
    recordSuccess("replicate");
    return { predictionId: id };
  } catch (err) {
    const e = err instanceof AiError ? err : new AiError("REPLICATE_FAILED", "Replicate could not start colorize.", 502);
    recordFailure("replicate", e.rateLimited);
    throw e;
  }
}

export { replicateGet, replicateOutputUrl, replicateFetchOutput, replicateCostEstimate };
export type { ReplicatePrediction };
