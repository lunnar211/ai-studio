// ElevenLabs adapter: text-to-speech, ready for future voice features.
//
// Verified 2026-11-01: the owner's key is VALID (user 200, free tier,
// 0/10,000 characters used, 24 voices). The adapter is fully built but
// NO user-facing feature calls it yet — the owner said not to invent an
// audio feature just to use it. When a voice feature is approved, this
// is the adapter it will use. It becomes live only after the owner
// pastes ELEVENLABS_API_KEY into Vercel and redeploys.

import { AiError } from "../types";

// Default voice: "Sarah — Mature, Reassuring, Confident" (public voice
// id from the owner's verified voices list). Overridable via env.
export const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";

function key(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new AiError("AI_NOT_CONFIGURED", "ElevenLabs is not configured.", 503);
  return k;
}

/** Synthesize speech. Returns MP3 bytes. Free tier: 10,000 chars/month. */
export async function elevenlabsSpeak(opts: {
  text: string;
  voiceId?: string;
  timeoutMs?: number;
}): Promise<{ audio: Buffer; provider: "elevenlabs"; model: string }> {
  const started = Date.now();
  void started;
  const voiceId = opts.voiceId ?? ELEVENLABS_VOICE_ID;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": key(),
    },
    body: JSON.stringify({
      text: opts.text.slice(0, 5000),
      model_id: "eleven_multilingual_v2",
      output_format: "mp3_44100_128",
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60000),
  }).catch(() => null);
  if (!res) throw new AiError("ELEVENLABS_FAILED", "Could not reach ElevenLabs.", 502);
  if (res.status === 429) {
    throw new AiError("ELEVENLABS_RATE_LIMITED", "ElevenLabs is rate limited right now.", 429, true);
  }
  if (!res.ok) {
    throw new AiError("ELEVENLABS_FAILED", "ElevenLabs could not synthesize that text.", 502);
  }
  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length === 0) throw new AiError("ELEVENLABS_EMPTY", "ElevenLabs returned no audio.", 502);
  return { audio, provider: "elevenlabs", model: "eleven_multilingual_v2" };
}
