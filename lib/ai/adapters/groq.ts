// Groq adapter: fast text (logo SVG, briefs, captions) + Whisper
// speech-to-text. Verified live 2026-11-01 on the owner's key:
// openai/gpt-oss-120b (primary), openai/gpt-oss-20b (fallback),
// whisper-large-v3-turbo (STT), llama-prompt-guard-2-86m and
// openai/gpt-oss-safeguard-20b (text safety classifiers).
// llama-3.3-70b-versatile is RETIRED and is never used.

import { AiError, type AiTextResult } from "../types";

const BASE = "https://api.groq.com/openai/v1";

export const GROQ_TEXT_PRIMARY =
  process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-120b";
export const GROQ_TEXT_FALLBACK =
  process.env.GROQ_TEXT_FALLBACK_MODEL || "openai/gpt-oss-20b";
export const GROQ_STT_MODEL =
  process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";

function key(): string {
  const k = process.env.GROQ_API_KEY;
  if (!k) throw new AiError("AI_NOT_CONFIGURED", "Groq is not configured.", 503);
  return k;
}

async function postJson(
  path: string,
  body: unknown,
  timeoutMs: number
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key()}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => null)) as unknown;
  return { status: res.status, json };
}

export async function groqChat(opts: {
  system?: string;
  user: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<AiTextResult> {
  const started = Date.now();
  const model = opts.model ?? GROQ_TEXT_PRIMARY;
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });
  let lastStatus = 0;
  // 1 retry on transient failures (the router also falls back across
  // providers, so this retry is per-provider, not per-request).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { status, json } = await postJson(
        "/chat/completions",
        {
          model,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 1500,
          messages,
        },
        opts.timeoutMs ?? 25000
      );
      lastStatus = status;
      if (status === 429) {
        if (attempt === 0) continue;
        throw new AiError("GROQ_RATE_LIMITED", "Groq is rate limited right now.", 429, true);
      }
      if (status === 404) {
        throw new AiError("GROQ_MODEL_GONE", `Groq model ${model} is not available.`, 502);
      }
      if (status < 200 || status >= 300) {
        if (attempt === 0) continue;
        throw new AiError("GROQ_FAILED", "Groq did not return a usable answer.", 502);
      }
      const data = json as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new AiError("GROQ_EMPTY", "Groq returned an empty answer.", 502);
      return { text, provider: "groq", model, latencyMs: Date.now() - started };
    } catch (err) {
      if (err instanceof AiError) throw err;
      if (attempt === 0) continue;
      throw new AiError("GROQ_FAILED", "Could not reach Groq.", 502);
    }
  }
  throw new AiError("GROQ_FAILED", "Groq did not return a usable answer.", lastStatus === 429 ? 429 : 502, lastStatus === 429);
}

/** Speech-to-text via Groq Whisper. Audio must be webm/mp3/wav/m4a. */
export async function groqTranscribe(opts: {
  audio: Buffer;
  filename: string;
  mime: string;
  timeoutMs?: number;
}): Promise<AiTextResult> {
  const started = Date.now();
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(opts.audio)], { type: opts.mime }), opts.filename);
  form.append("model", GROQ_STT_MODEL);
  form.append("response_format", "text");
  let res: Response;
  try {
    res = await fetch(`${BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}` },
      body: form,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60000),
    });
  } catch {
    throw new AiError("GROQ_FAILED", "Could not reach Groq for transcription.", 502);
  }
  if (res.status === 429) {
    throw new AiError("GROQ_RATE_LIMITED", "Groq is rate limited right now.", 429, true);
  }
  if (!res.ok) {
    throw new AiError("GROQ_FAILED", "Transcription failed.", 502);
  }
  const text = (await res.text()).trim();
  if (!text) throw new AiError("GROQ_EMPTY", "No speech was recognised.", 502);
  return { text, provider: "groq", model: GROQ_STT_MODEL, latencyMs: Date.now() - started };
}
