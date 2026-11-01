// Voice-to-prompt for the logo generator: transcribe a short voice
// memo with Groq Whisper (the one verified STT provider) and return
// plain text the user can edit before generating. Same abuse bar as
// logo generation: Turnstile verification + a per-IP daily bucket.
// The audio is sent to Groq for transcription only and is not stored.

import { NextResponse } from "next/server";
import { checkAiRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getSessionSafe } from "@/lib/auth";
import { isIpBlocked } from "@/lib/settings";
import { routeStt, type AiError } from "@/lib/ai/router";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "audio/webm",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
]);

export async function POST(req: Request) {
  const session = await getSessionSafe();
  const userId = (session?.user as unknown as { id?: string } | undefined)?.id ?? null;
  if ((session?.user as unknown as { status?: string } | undefined)?.status === "SUSPENDED") {
    return NextResponse.json({ error: "Account suspended." }, { status: 403 });
  }
  const ip = getClientIp(req);
  if (await isIpBlocked(ip)) {
    return NextResponse.json({ error: "Access from this network is blocked." }, { status: 403 });
  }
  const rl = await checkAiRateLimit(ip, "stt", 10);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Daily voice transcription limit reached (10 per day). Please type your prompt instead." },
      { status: 429, headers: rateLimitHeaders(rl.remaining, rl.limit) }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Please record a voice memo first." }, { status: 400 });
  }
  const token = form.get("turnstileToken");
  if (!(await verifyTurnstile(typeof token === "string" ? token : null))) {
    return NextResponse.json({ error: "Verification failed. Please complete the verification checkbox and try again." }, { status: 400 });
  }
  const file = form.get("audio");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Please record a voice memo first." }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "Voice memo must be under 10 MB." }, { status: 400 });
  }
  const mime = file.type || "audio/webm";
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json({ error: "That audio format is not supported. Please record again." }, { status: 400 });
  }
  const ext = mime === "audio/mpeg" || mime === "audio/mp3" ? "mp3" : mime === "audio/wav" || mime === "audio/x-wav" ? "wav" : mime === "audio/ogg" ? "ogg" : mime === "audio/mp4" || mime === "audio/m4a" ? "m4a" : "webm";

  try {
    const result = await routeStt({ audio: buf, filename: `memo.${ext}`, mime, userId });
    const text = result.text.trim().slice(0, 300);
    if (!text) {
      return NextResponse.json({ error: "No speech was detected. Please record again or type your prompt." }, { status: 400 });
    }
    return NextResponse.json({ text });
  } catch (err) {
    const e = err as AiError;
    if (e?.code === "AI_NOT_CONFIGURED") {
      return NextResponse.json({ error: "Voice transcription is not configured yet." }, { status: 503 });
    }
    if (e?.rateLimited) {
      return NextResponse.json({ error: "The transcription service is busy right now. Please wait a minute and try again." }, { status: 429 });
    }
    return NextResponse.json({ error: "Could not transcribe that recording. Please try again or type your prompt." }, { status: 502 });
  }
}
