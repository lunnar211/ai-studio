// Google Gemini adapter: text + vision analysis + quality judge.
//
// Verified 2026-11-01: the owner's key is VALID (gemini-3.8-flash is the
// current model; gemini-2.0-flash is retired and is never used). At
// verification time the model answered 503 "high demand" twice — a
// transient capacity error, not an auth failure — so this adapter
// retries once and the router falls back to NVIDIA/Groq vision on
// repeated 503s. Vision uses generateContent with inlineData, per the
// public Gemini API; it becomes live only after the owner pastes
// GEMINI_API_KEY into Vercel and redeploys.

import { AiError, type AiTextResult, type AiVisionAnalysis } from "../types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

function key(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new AiError("AI_NOT_CONFIGURED", "Gemini is not configured.", 503);
  return k;
}

interface Part {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

async function generateContent(
  parts: Part[],
  timeoutMs: number,
  maxTokens = 1200
): Promise<{ status: number; text: string }> {
  const url = `${BASE}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key())}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => null)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  } | null;
  const text =
    json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return { status: res.status, text };
}

export async function geminiChat(opts: {
  system?: string;
  user: string;
  timeoutMs?: number;
}): Promise<AiTextResult> {
  const started = Date.now();
  const prompt = opts.system ? `${opts.system}\n\n${opts.user}` : opts.user;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { status, text } = await generateContent(
        [{ text: prompt }],
        opts.timeoutMs ?? 25000
      );
      if (status === 429) {
        if (attempt === 0) continue;
        throw new AiError("GEMINI_RATE_LIMITED", "Gemini is rate limited right now.", 429, true);
      }
      if (status === 503) {
        if (attempt === 0) continue;
        throw new AiError("GEMINI_OVERLOADED", "Gemini is overloaded right now. Please try again shortly.", 503);
      }
      if (status < 200 || status >= 300 || !text) {
        if (attempt === 0) continue;
        throw new AiError("GEMINI_FAILED", "Gemini did not return a usable answer.", 502);
      }
      return { text, provider: "gemini", model: GEMINI_MODEL, latencyMs: Date.now() - started };
    } catch (err) {
      if (err instanceof AiError) throw err;
      if (attempt === 0) continue;
      throw new AiError("GEMINI_FAILED", "Could not reach Gemini.", 502);
    }
  }
  throw new AiError("GEMINI_FAILED", "Gemini did not return a usable answer.", 502);
}

/** Vision analysis: describe a photo for pipeline choice + quality notes. */
export async function geminiAnalyzePhoto(opts: {
  image: Buffer;
  mime: string;
  question: string;
  timeoutMs?: number;
}): Promise<AiVisionAnalysis> {
  const started = Date.now();
  const parts: Part[] = [
    { text: opts.question },
    { inlineData: { mimeType: opts.mime, data: opts.image.toString("base64") } },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { status, text } = await generateContent(parts, opts.timeoutMs ?? 30000);
      if (status === 429) {
        if (attempt === 0) continue;
        throw new AiError("GEMINI_RATE_LIMITED", "Gemini is rate limited right now.", 429, true);
      }
      if (status === 503) {
        if (attempt === 0) continue;
        throw new AiError("GEMINI_OVERLOADED", "Gemini is overloaded right now.", 503);
      }
      if (status < 200 || status >= 300 || !text) {
        if (attempt === 0) continue;
        throw new AiError("GEMINI_FAILED", "Gemini vision did not return a usable answer.", 502);
      }
      return parseVisionAnswer(text, "gemini", GEMINI_MODEL, started);
    } catch (err) {
      if (err instanceof AiError) throw err;
      if (attempt === 0) continue;
      throw new AiError("GEMINI_FAILED", "Could not reach Gemini.", 502);
    }
  }
  throw new AiError("GEMINI_FAILED", "Gemini vision did not return a usable answer.", 502);
}

/** Parse the model's JSON-ish answer defensively; unknown = null. */
export function parseVisionAnswer(
  text: string,
  provider: AiVisionAnalysis["provider"],
  model: string,
  started: number
): AiVisionAnalysis {
  const base: AiVisionAnalysis = {
    isGrayscale: false,
    faceCount: null,
    noiseLevel: null,
    blurLevel: null,
    damageLevel: null,
    eraGuess: null,
    recommendation: "Enhance only",
    notes: [],
    provider,
    model,
    heuristicOnly: false,
  };
  try {
    const jsonText = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const data = JSON.parse(jsonText) as Record<string, unknown>;
    if (typeof data.isGrayscale === "boolean") base.isGrayscale = data.isGrayscale;
    if (typeof data.faceCount === "number") base.faceCount = data.faceCount;
    for (const k of ["noiseLevel", "blurLevel", "damageLevel"] as const) {
      if (data[k] === "low" || data[k] === "medium" || data[k] === "high") base[k] = data[k];
    }
    if (typeof data.eraGuess === "string") base.eraGuess = data.eraGuess.slice(0, 40);
    if (typeof data.recommendation === "string") base.recommendation = data.recommendation.slice(0, 80);
    if (Array.isArray(data.notes)) {
      base.notes = data.notes.filter((n) => typeof n === "string").slice(0, 4) as string[];
    }
  } catch {
    // Non-JSON answer: keep the measured defaults, note it plainly.
    base.notes = ["The vision model did not return a structured answer."];
  }
  void started;
  return base;
}
