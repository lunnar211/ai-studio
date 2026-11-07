import { NextResponse } from "next/server";
import { z } from "zod";
import { sanitizeSvg } from "@/lib/svg-sanitize";
import { findBlocked } from "@/lib/blocklist";
import { checkMinuteRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getSessionSafe } from "@/lib/auth";
import { getSetting, isIpBlocked, logJob } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import {
  LOGO_MODEL_FALLBACK,
  buildLogoSystemPrompt,
  cleanPrompt,
  isRefusal,
  validateLogoSvg,
} from "@/lib/logo";
import { anyProviderEnabled, routeText, type AiError } from "@/lib/ai/router";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  prompt: z.string().trim().min(3).max(300),
  style: z.enum(["flat", "minimal", "geometric", "badge", "monogram"]).default("flat"),
  colors: z.string().trim().max(120).optional().default("pink and cyan"),
  brandName: z.string().trim().max(40).optional().default(""),
  turnstileToken: z.string().max(2048).optional(),
});

type GenResult = { svg: string | null; refused: boolean; rateLimited: boolean; provider: string | null };

// Logo generation through the Phase 0 router: the router tries the
// configured text providers in priority order (Groq first), retries
// once per provider, and falls back across providers. The route still
// validates + sanitizes every SVG itself — a provider answer is never
// trusted blindly.
async function generateOne(
  system: string,
  prompt: string,
  onlyProvider?: "groq" | "openrouter" | "gemini",
  model?: string
): Promise<GenResult> {
  const miss: GenResult = { svg: null, refused: false, rateLimited: false, provider: null };
  try {
    const result = await routeText({
      system,
      user: `Logo concept: ${prompt}`,
      temperature: 0.7,
      maxTokens: 1500,
      timeoutMs: 25000,
      onlyProvider,
      model,
    });
    if (isRefusal(result.text)) return { ...miss, refused: true, provider: result.provider };
    const cleaned = sanitizeSvg(result.text);
    if (!cleaned || !validateLogoSvg(cleaned)) return miss;
    return { svg: cleaned, refused: false, rateLimited: false, provider: result.provider };
  } catch (err) {
    const e = err as AiError;
    if (e?.rateLimited) return { ...miss, rateLimited: true };
    return miss;
  }
}

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
    return NextResponse.json({ error: "Please describe your logo in 3 to 300 characters." }, { status: 400 });
  }
  const { prompt, style, colors, brandName, turnstileToken } = parsed.data;

  // Prompt-injection guard first, then the blocklist on BOTH the original
  // and the cleaned prompt, so cleaning can never hide a brand term.
  const cleanedPrompt = cleanPrompt(prompt);
  const blocked = findBlocked(prompt) ?? findBlocked(cleanedPrompt);
  if (blocked) {
    const session0 = await getSessionSafe();
    await logJob({
      userId: (session0?.user as unknown as { id?: string } | undefined)?.id ?? null,
      tool: "logo",
      status: "FAILED",
      inputSummary: `blocked:${blocked.category}`,
      errorCode: "BLOCKED_PROMPT",
    });
    return NextResponse.json(
      { error: "That prompt was refused because it references an existing brand, character, public figure, or disallowed content. Please describe an original logo concept instead." },
      { status: 400 }
    );
  }

  // Tool on/off + maintenance mode (admin settings; defaults keep the
  // previous behaviour).
  if ((await getSetting("logoEnabled")) !== "true") {
    return NextResponse.json({ error: "The logo generator is temporarily disabled." }, { status: 503 });
  }

  // Logo generation is FREE + UNLIMITED for every user including
  // guests (owner decision 2026-11-01): no daily quota, no credit
  // balance, no "limit reached" path. The only gate is the 5/min
  // per-IP abuse limiter — not a usage cap, it still allows
  // thousands of uses per day per IP. Signed-in status only decides
  // whether the result is saved to logo history below.
  const session = await getSessionSafe();
  const userId = (session?.user as unknown as { id?: string } | undefined)?.id ?? null;
  if ((session?.user as unknown as { status?: string } | undefined)?.status === "SUSPENDED") {
    return NextResponse.json({ error: "Account suspended." }, { status: 403 });
  }
  const ip = getClientIp(req);
  if (await isIpBlocked(ip)) {
    return NextResponse.json({ error: "Access from this network is blocked." }, { status: 403 });
  }
  const minute = await checkMinuteRateLimit(ip, "logo", 5);
  if (!minute.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a minute and try again." },
      { status: 429, headers: rateLimitHeaders(minute.remaining, 5) }
    );
  }

  if (!(await verifyTurnstile(turnstileToken))) {
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 400 });
  }

  // Any configured text provider can serve logos. With no provider key
  // at all, say so in plain words (P0: no provider or env var names in
  // responses) and name the missing piece: the AI service connection.
  if (!(await anyProviderEnabled("text"))) {
    return NextResponse.json(
      { error: "AI logo generation is unavailable right now because the AI service is not connected yet. Please try again later." },
      { status: 503 }
    );
  }

  // 3 variants in parallel through the router. Round 1 uses the default
  // provider order; round 2 fills missing slots from a different
  // provider (diversity) or the Groq fallback model. Retrying is honest
  // — it never fabricates a logo, it just asks the model again. A 429
  // is surfaced honestly instead of crashing or faking output.
  const system = buildLogoSystemPrompt(style, colors, brandName);
  const variants: string[] = [];
  let sawRefusal = false;
  let sawRateLimit = false;
  const round1 = await Promise.all([
    generateOne(system, cleanedPrompt),
    generateOne(system, cleanedPrompt),
    generateOne(system, cleanedPrompt),
  ]);
  for (const r of round1) {
    if (r.svg) {
      variants.push(r.svg);
    }
    if (r.refused) sawRefusal = true;
    if (r.rateLimited) sawRateLimit = true;
  }
  if (variants.length < 3) {
    const missing = 3 - variants.length;
    // Diversity round: try another provider first, then the Groq
    // fallback model. Each call still goes through the router.
    const round2 = await Promise.all(
      Array.from({ length: missing }, (_, i) =>
        i === 0
          ? generateOne(system, cleanedPrompt, "openrouter")
          : generateOne(system, cleanedPrompt, "groq", LOGO_MODEL_FALLBACK)
      )
    );
    for (const r of round2) {
      if (r.svg) {
        variants.push(r.svg);
      }
      if (r.refused) sawRefusal = true;
      if (r.rateLimited) sawRateLimit = true;
    }
  }

  if (variants.length === 0) {
    if (sawRefusal) {
      await logJob({ userId, tool: "logo", status: "FAILED", errorCode: "MODEL_REFUSED" });
      return NextResponse.json(
        { error: "That concept was refused because it references a brand, celebrity, or copyrighted character. Please describe an original concept instead." },
        { status: 400 }
      );
    }
    if (sawRateLimit) {
      await logJob({ userId, tool: "logo", status: "FAILED", errorCode: "GROQ_RATE_LIMITED" });
      return NextResponse.json(
        { error: "The AI service is busy right now. Please wait a minute and try again." },
        { status: 429 }
      );
    }
    await logJob({ userId, tool: "logo", status: "FAILED", errorCode: "GROQ_UNUSABLE" });
    return NextResponse.json({ error: "The AI response was not a usable logo. Please try again." }, { status: 502 });
  }

  // Save to the signed-in user's logo history (best effort: the table
  // only exists after the owner pushes the schema once; guests have no
  // history, which the UI states plainly).
  if (userId && prisma) {
    try {
      await prisma.logoGeneration.create({
        data: {
          userId,
          prompt: cleanedPrompt.slice(0, 300),
          style,
          colors: colors.slice(0, 120),
          brandName: brandName || null,
          variantsJson: JSON.stringify(variants),
        },
      });
    } catch {
      // History must never break a generation response.
    }
  }
  await logJob({ userId, tool: "logo", status: "SUCCESS", inputSummary: cleanedPrompt.slice(0, 120), costEstimate: parseFloat(await getSetting("groqCostPerJobUsd")) || 0.001 });
  return NextResponse.json({
    variants,
    svg: variants[0],
  });
}
