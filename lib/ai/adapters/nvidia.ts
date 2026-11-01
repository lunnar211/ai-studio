// NVIDIA adapter: vision analysis (verified catalogue, 2026-11-01)
// + text safety classification.
//
// Verified models on the owner's key (85 models total):
// - Vision: meta/llama-3.2-11b-vision-instruct (primary — fast, cheap),
//   meta/llama-3.2-90b-vision-instruct, microsoft/phi-3-vision-128k-instruct
// - Text safety: nvidia/llama-3.1-nemoguard-8b-content-safety
// NOT in the catalogue, so NOT used: no FLUX/SDXL image model and no
// image-NSFW classifier. google/diffusiongemma-26b-a4b-it is a diffusion
// language model, not an image model, and is deliberately not used here.
// The endpoint is OpenAI-compatible: integrate.api.nvidia.com/v1.

import { AiError, type AiModerationResult, type AiVisionAnalysis } from "../types";
import { parseVisionAnswer } from "./gemini";

export const NVIDIA_VISION_MODEL =
  process.env.NVIDIA_VISION_MODEL || "meta/llama-3.2-11b-vision-instruct";
export const NVIDIA_SAFETY_MODEL =
  process.env.NVIDIA_SAFETY_MODEL || "nvidia/llama-3.1-nemoguard-8b-content-safety";

const BASE = "https://integrate.api.nvidia.com/v1";

function key(): string {
  const k = process.env.NVIDIA_API_KEY;
  if (!k) throw new AiError("AI_NOT_CONFIGURED", "NVIDIA is not configured.", 503);
  return k;
}

interface ChatMessage {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

async function chatCompletions(
  model: string,
  messages: ChatMessage[],
  timeoutMs: number,
  maxTokens = 1200
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key()}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: maxTokens,
      messages,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  return { status: res.status, text: json?.choices?.[0]?.message?.content ?? "" };
}

const VISION_QUESTION = [
  "Analyse this photo and answer ONLY as JSON, no other text:",
  '{"isGrayscale": boolean, "faceCount": number|null, "noiseLevel": "low"|"medium"|"high"|null,',
  '"blurLevel": "low"|"medium"|"high"|null, "damageLevel": "low"|"medium"|"high"|null,',
  '"eraGuess": string|null, "recommendation": "Enhance only"|"Colorize"|"Colorize + HD"|"Enhance + HD",',
  '"notes": [short plain-language notes, max 4]}',
].join(" ");

export async function nvidiaAnalyzePhoto(opts: {
  image: Buffer;
  mime: string;
  timeoutMs?: number;
}): Promise<AiVisionAnalysis> {
  const started = Date.now();
  const dataUri = `data:${opts.mime};base64,${opts.image.toString("base64")}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { status, text } = await chatCompletions(
        NVIDIA_VISION_MODEL,
        [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_QUESTION },
              { type: "image_url", image_url: { url: dataUri } },
            ],
          },
        ],
        opts.timeoutMs ?? 30000
      );
      if (status === 429) {
        if (attempt === 0) continue;
        throw new AiError("NVIDIA_RATE_LIMITED", "NVIDIA is rate limited right now.", 429, true);
      }
      if (status < 200 || status >= 300 || !text) {
        if (attempt === 0) continue;
        throw new AiError("NVIDIA_FAILED", "NVIDIA vision did not return a usable answer.", 502);
      }
      return parseVisionAnswer(text, "nvidia", NVIDIA_VISION_MODEL, started);
    } catch (err) {
      if (err instanceof AiError) throw err;
      if (attempt === 0) continue;
      throw new AiError("NVIDIA_FAILED", "Could not reach NVIDIA.", 502);
    }
  }
  throw new AiError("NVIDIA_FAILED", "NVIDIA vision did not return a usable answer.", 502);
}

/**
 * Text safety check via NeMo Guard. The model answers with a safety
 * verdict; anything it cannot classify cleanly is treated as "not
 * flagged" (fail-open for text, because the route also enforces the
 * blocklist and length limits) — the moderation layer never invents a
 * refusal on its own.
 */
export async function nvidiaModerateText(opts: {
  text: string;
  timeoutMs?: number;
}): Promise<AiModerationResult> {
  const started = Date.now();
  void started;
  try {
    const { status, text } = await chatCompletions(
      NVIDIA_SAFETY_MODEL,
      [
        { role: "user", content: `Classify this user text for safety. Reply with exactly SAFE or UNSAFE followed by the violated category if unsafe.\n\nText: ${opts.text.slice(0, 2000)}` },
      ],
      opts.timeoutMs ?? 15000,
      60
    );
    if (status < 200 || status >= 300) {
      // A failed safety check must NOT report "not flagged": the router
      // falls through to the next moderation provider (OpenRouter) and,
      // if none answers, reports checked:false honestly.
      throw new AiError("NVIDIA_MODERATION_FAILED", "NVIDIA safety check failed.", 502);
    }
    const flagged = /^unsafe\b/i.test(text.trim());
    return {
      flagged,
      categories: flagged ? ["unsafe"] : [],
      provider: "nvidia",
      model: NVIDIA_SAFETY_MODEL,
    };
  } catch (err) {
    if (err instanceof AiError) throw err;
    throw new AiError("NVIDIA_MODERATION_FAILED", "NVIDIA safety check failed.", 502);
  }
}
