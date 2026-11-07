// Raster image generation API: prompt in, image out.
//
// Paid feature — read lib/ai/image-generate/limits.ts before
// changing any gate here. Every provider in the chain bills the
// owner per image, so unlike logos and free-route photos this
// tool REQUIRES sign-in and enforces a daily budget (FREE 10/day,
// PREMIUM 100/day, 1 credit per image). Guests never reach a paid
// model: a guest gets 401, not a generation.
//
// P0 rules enforced here (same as the logo route):
// - Every client-facing message is GENERIC: no provider name, no
//   model slug, no env var name, no raw error text. Real errors go
//   to console.error (server logs) only.
// - 5 requests/minute per IP abuse limiter (same as every tool).
// - Prompts referencing existing brands, characters or public
//   figures are refused via the shared blocklist, like logos.
// - The daily spend cap (lib/ai/usage.ts, default $10/day across
//   paid providers) stops new paid generations at the cap.

import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { findBlocked } from "@/lib/blocklist";
import { checkMinuteRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getSessionSafe } from "@/lib/auth";
import { getSetting, getSettings, isIpBlocked, logJob } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { logAiUsage, checkSpendCap } from "@/lib/ai/usage";
import { GEMINI_IMAGE_COST_PER_IMAGE } from "@/lib/ai/adapters/gemini-image";
import { generateImage, generateProvidersConfigured } from "@/lib/ai/image-generate/chain";
import { checkGenerateBudget, GENERATE_COST } from "@/lib/ai/image-generate/limits";
import type { AiError } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  prompt: z.string().trim().min(3).max(500),
  size: z.enum(["square", "portrait", "landscape", "wide"]).default("square"),
  turnstileToken: z.string().max(2048).optional(),
});

export async function GET() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please describe your image in 3 to 500 characters." }, { status: 400 });
  }
  const { prompt, size, turnstileToken } = parsed.data;

  if ((await getSetting("imageGenerateEnabled")) !== "true") {
    return NextResponse.json({ error: "Image generation is temporarily disabled." }, { status: 503 });
  }

  // Blocklist on the raw prompt, like the logo route: a refused
  // prompt is never sent to a paid model.
  const blocked = findBlocked(prompt);
  if (blocked) {
    const session0 = await getSessionSafe();
    await logJob({
      userId: (session0?.user as unknown as { id?: string } | undefined)?.id ?? null,
      tool: "generate",
      status: "FAILED",
      inputSummary: `blocked:${blocked.category}`,
      errorCode: "BLOCKED_PROMPT",
    });
    return NextResponse.json(
      { error: "That prompt was refused because it references an existing brand, character, public figure, or disallowed content. Please describe an original image instead." },
      { status: 400 }
    );
  }

  // Sign-in is REQUIRED: paid generation cannot be anonymous, or
  // one IP could burn the owner's balance through the daily budget
  // of a throwaway session. Guests get a plain sign-in message.
  const session = await getSessionSafe();
  const userId = (session?.user as unknown as { id?: string } | undefined)?.id ?? null;
  if (!userId) {
    return NextResponse.json(
      { error: "Please sign in to generate images. Image generation uses a daily budget (10 images a day on Free, 100 on Premium)." },
      { status: 401 }
    );
  }
  const userPlan = (session?.user as unknown as { plan?: string } | undefined)?.plan === "PREMIUM" ? "PREMIUM" : "FREE";
  if ((session?.user as unknown as { status?: string } | undefined)?.status === "SUSPENDED") {
    return NextResponse.json({ error: "Account suspended." }, { status: 403 });
  }
  const ip = getClientIp(req);
  if (await isIpBlocked(ip)) {
    return NextResponse.json({ error: "Access from this network is blocked." }, { status: 403 });
  }
  const minute = await checkMinuteRateLimit(ip, "image-generate", 5);
  if (!minute.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a minute and try again." },
      { status: 429, headers: rateLimitHeaders(minute.remaining, 5) }
    );
  }

  if (!(await verifyTurnstile(turnstileToken))) {
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 400 });
  }

  // No provider key at all: say so plainly (no provider or env var
  // names in the response) and name the missing piece: the AI
  // service connection.
  const settings = await getSettings();
  if (!generateProvidersConfigured(settings)) {
    return NextResponse.json(
      { error: "Image generation is unavailable right now because the AI service is not connected yet. Please try again later." },
      { status: 503 }
    );
  }

  // Daily budget: without a database the count is unknown and the
  // route fails closed — an uncounted paid generation must not run.
  if (!prisma) {
    return NextResponse.json(
      { error: "Image generation is unavailable right now because usage tracking is not set up yet." },
      { status: 503 }
    );
  }
  const budget = await checkGenerateBudget({ userId, plan: userPlan });
  if (!budget.ok) {
    if (budget.used === null) {
      return NextResponse.json(
        { error: "Image generation is unavailable right now because usage tracking is not set up yet." },
        { status: 503 }
      );
    }
    await logJob({ userId, tool: "generate", status: "FAILED", errorCode: "DAILY_BUDGET" });
    return NextResponse.json(
      { error: `You have reached your daily image budget (${budget.budget} images a day on ${userPlan === "PREMIUM" ? "Premium" : "Free"}). Please try again tomorrow.` },
      { status: 429 }
    );
  }

  // Daily spend cap across paid providers (existing plumbing).
  const spend = await checkSpendCap();
  if (!spend.ok) {
    return NextResponse.json(
      { error: "Image generation is paused for today because the daily AI budget is reached. Please try again tomorrow." },
      { status: 503 }
    );
  }

  const started = Date.now();
  let result;
  try {
    result = await generateImage({ prompt, size }, settings);
  } catch (err) {
    const e = err as AiError;
    console.error("image-generate failed", e?.code ?? "unknown");
    await logJob({ userId, tool: "generate", status: "FAILED", inputSummary: prompt.slice(0, 120), errorCode: e?.code ?? "GENERATE_FAILED" });
    if (e?.rateLimited) {
      return NextResponse.json(
        { error: "The AI service is busy right now. Please wait a minute and try again." },
        { status: 429 }
      );
    }
    if (e?.code === "AI_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: "Image generation is unavailable right now because the AI service is not connected yet. Please try again later." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "The image could not be generated. Please try again with a different description." },
      { status: 502 }
    );
  }

  // Dimensions from the bytes themselves (never trust a provider's
  // claimed size); a failure here never breaks the response.
  let width: number | undefined;
  let height: number | undefined;
  try {
    const meta = await sharp(result.buffer).metadata();
    width = meta.width;
    height = meta.height;
  } catch {
    // Ignore; the image itself is still returned.
  }

  // Usage accounting: 1 credit per image. Gemini cost is the repo's
  // verified $0.041 estimate; fal.ai and HF costs are recorded as 0
  // because no verified per-image price is on file for them — the
  // real bill is the provider's, and the daily budget above is the
  // primary guard. Never expose provider or model to the client.
  await logJob({ userId, tool: "generate", status: "SUCCESS", inputSummary: prompt.slice(0, 120), costEstimate: result.provider === "gemini" ? GEMINI_IMAGE_COST_PER_IMAGE : 0 });
  await logAiUsage({
    provider: result.provider,
    model: result.model,
    capability: "image-generate",
    latencyMs: Date.now() - started,
    success: true,
    costUsd: result.provider === "gemini" ? GEMINI_IMAGE_COST_PER_IMAGE : 0,
    credits: GENERATE_COST,
    userId,
  });
  return NextResponse.json({
    image: `data:${result.mime};base64,${result.buffer.toString("base64")}`,
    mime: result.mime,
    width,
    height,
    remaining: budget.remaining,
    budget: budget.budget,
  });
}
