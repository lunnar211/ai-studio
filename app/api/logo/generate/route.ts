import { NextResponse } from "next/server";
import { z } from "zod";
import { sanitizeSvg } from "@/lib/svg-sanitize";
import { findBlocked } from "@/lib/blocklist";
import { checkAiRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getSessionSafe } from "@/lib/auth";
import { countJobsToday, dailyQuota, getSetting, isIpBlocked, logJob } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import {
  LOGO_MODEL_FALLBACK,
  LOGO_MODEL_PRIMARY,
  buildLogoSystemPrompt,
  cleanPrompt,
  isRefusal,
  validateLogoSvg,
} from "@/lib/logo";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  prompt: z.string().trim().min(3).max(300),
  style: z.enum(["flat", "minimal", "geometric", "badge", "monogram"]).default("flat"),
  colors: z.string().trim().max(120).optional().default("pink and cyan"),
  brandName: z.string().trim().max(40).optional().default(""),
  turnstileToken: z.string().max(2048).optional(),
});

type GenResult = { svg: string | null; refused: boolean; rateLimited: boolean };

async function generateOne(
  apiKey: string,
  model: string,
  system: string,
  prompt: string
): Promise<GenResult> {
  const miss: GenResult = { svg: null, refused: false, rateLimited: false };
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 1500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Logo concept: ${prompt}` },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (res.status === 429) return { ...miss, rateLimited: true };
    if (!res.ok) return miss;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    if (isRefusal(content)) return { ...miss, refused: true };
    const cleaned = sanitizeSvg(content);
    if (!cleaned || !validateLogoSvg(cleaned)) return miss;
    return { svg: cleaned, refused: false, rateLimited: false };
  } catch {
    return miss;
  }
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

  // Signed-in users get the SiteSetting quota (counted from Job rows);
  // guests keep the previous per-IP limit (10/day).
  // One request = one quota unit, however many variants it returns.
  const session = await getSessionSafe();
  const userId = (session?.user as unknown as { id?: string; plan?: string } | undefined)?.id ?? null;
  const userPlan = (session?.user as unknown as { plan?: string } | undefined)?.plan === "PREMIUM" ? "PREMIUM" : "FREE";
  if ((session?.user as unknown as { status?: string } | undefined)?.status === "SUSPENDED") {
    return NextResponse.json({ error: "Account suspended." }, { status: 403 });
  }
  const ip = getClientIp(req);
  if (await isIpBlocked(ip)) {
    return NextResponse.json({ error: "Access from this network is blocked." }, { status: 403 });
  }
  let rl = { ok: true, remaining: 9, limit: 10 };
  if (userId) {
    const quota = await dailyQuota("logo", userPlan as "FREE" | "PREMIUM");
    const used = await countJobsToday(userId, "logo");
    rl = { ok: used < quota, remaining: Math.max(0, quota - used - 1), limit: quota };
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Daily limit reached (${quota} logos per day on your plan). Please try again tomorrow, or upgrade to Premium for 100 per day.` },
        { status: 429, headers: rateLimitHeaders(0, quota) }
      );
    }
  } else {
    rl = await checkAiRateLimit(ip, "logo");
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Daily free limit reached (10 logos per day). Please try again tomorrow, or upgrade to Premium for 100 per day." },
        { status: 429, headers: rateLimitHeaders(rl.remaining, rl.limit) }
      );
    }
  }

  if (!(await verifyTurnstile(turnstileToken))) {
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI logo generation needs GROQ_API_KEY. Add it in Vercel env and redeploy." },
      { status: 503, headers: rateLimitHeaders(rl.remaining, rl.limit) }
    );
  }

  // 3 variants in parallel. Round 1 uses the primary (largest) model;
  // round 2 fills any missing slots with the fallback model. Retrying is
  // honest — it never fabricates a logo, it just asks the model again.
  // A 429 is surfaced honestly instead of crashing or faking output.
  const system = buildLogoSystemPrompt(style, colors, brandName);
  const variants: string[] = [];
  let sawRefusal = false;
  let sawRateLimit = false;
  const round1 = await Promise.all([
    generateOne(apiKey, LOGO_MODEL_PRIMARY, system, cleanedPrompt),
    generateOne(apiKey, LOGO_MODEL_PRIMARY, system, cleanedPrompt),
    generateOne(apiKey, LOGO_MODEL_PRIMARY, system, cleanedPrompt),
  ]);
  for (const r of round1) {
    if (r.svg) variants.push(r.svg);
    if (r.refused) sawRefusal = true;
    if (r.rateLimited) sawRateLimit = true;
  }
  if (variants.length < 3) {
    const missing = 3 - variants.length;
    const round2 = await Promise.all(
      Array.from({ length: missing }, () => generateOne(apiKey, LOGO_MODEL_FALLBACK, system, cleanedPrompt))
    );
    for (const r of round2) {
      if (r.svg) variants.push(r.svg);
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
        { error: "The AI service is busy right now (rate limited). Please wait a minute and try again — nothing was charged to your limit beyond this request." },
        { status: 429, headers: rateLimitHeaders(rl.remaining, rl.limit) }
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
  return NextResponse.json(
    { variants, svg: variants[0], remaining: rl.remaining, limit: rl.limit, model: LOGO_MODEL_PRIMARY },
    { headers: rateLimitHeaders(rl.remaining, rl.limit) }
  );
}
