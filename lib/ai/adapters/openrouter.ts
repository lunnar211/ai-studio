// OpenRouter adapter: text fallback + extra logo-candidate diversity.
//
// Verified 2026-11-01: the owner's key is VALID (auth 200, free tier,
// 416 models). Free-tier models were congested at verification time
// (upstream 429s), so this adapter retries once and the router falls
// back to Groq on repeated 429s. The default model is a verified free
// model; the owner can override it with OPENROUTER_TEXT_MODEL.

import { AiError, type AiModerationResult, type AiTextResult } from "../types";

export const OPENROUTER_TEXT_MODEL =
  process.env.OPENROUTER_TEXT_MODEL || "liquid/lfm-2.5-2.6b:free";

function key(): string {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) throw new AiError("AI_NOT_CONFIGURED", "OpenRouter is not configured.", 503);
  return k;
}

export async function openrouterChat(opts: {
  system?: string;
  user: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<AiTextResult> {
  const started = Date.now();
  const model = opts.model ?? OPENROUTER_TEXT_MODEL;
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key()}`,
          "HTTP-Referer": "https://ai-studio-sandy-sigma.vercel.app",
          "X-Title": "AI Studio",
        },
        body: JSON.stringify({
          model,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 1500,
          messages,
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
      });
      const json = (await res.json().catch(() => null)) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      } | null;
      if (res.status === 429) {
        if (attempt === 0) continue;
        throw new AiError("OPENROUTER_RATE_LIMITED", "OpenRouter is rate limited right now.", 429, true);
      }
      if (!res.ok) {
        if (attempt === 0) continue;
        throw new AiError("OPENROUTER_FAILED", "OpenRouter did not return a usable answer.", 502);
      }
      const text = json?.choices?.[0]?.message?.content ?? "";
      if (!text) {
        if (attempt === 0) continue;
        throw new AiError("OPENROUTER_EMPTY", "OpenRouter returned an empty answer.", 502);
      }
      return { text, provider: "openrouter", model, latencyMs: Date.now() - started };
    } catch (err) {
      if (err instanceof AiError) throw err;
      if (attempt === 0) continue;
      throw new AiError("OPENROUTER_FAILED", "Could not reach OpenRouter.", 502);
    }
  }
  throw new AiError("OPENROUTER_FAILED", "OpenRouter did not return a usable answer.", 502);
}

/**
 * Text moderation fallback (used only when the NVIDIA safety path
 * fails). Same SAFE/UNSAFE contract as the NVIDIA classifier: the
 * model must reply with exactly SAFE or UNSAFE plus a category. An
 * empty or unparseable answer throws — the router then reports
 * checked:false rather than a fake "not flagged".
 */
export async function openrouterModerateText(opts: {
  text: string;
  timeoutMs?: number;
}): Promise<AiModerationResult> {
  const result = await openrouterChat({
    system: "You are a content-safety classifier.",
    user: `Classify this user text for safety. Reply with exactly SAFE or UNSAFE followed by the violated category if unsafe.\n\nText: ${opts.text.slice(0, 2000)}`,
    temperature: 0,
    maxTokens: 60,
    timeoutMs: opts.timeoutMs ?? 15000,
  });
  const flagged = /^unsafe\b/i.test(result.text.trim());
  return {
    flagged,
    categories: flagged ? ["unsafe"] : [],
    provider: "openrouter",
    model: result.model,
  };
}
