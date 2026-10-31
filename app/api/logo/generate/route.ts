import { NextResponse } from "next/server";
import { z } from "zod";
import { sanitizeSvg } from "@/lib/svg-sanitize";
import { findBlocked } from "@/lib/blocklist";
import { checkAiRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getSessionSafe } from "@/lib/auth";
import { countJobsToday, dailyQuota, getSetting, isIpBlocked, logJob } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  prompt: z.string().trim().min(3).max(300),
  style: z.enum(["flat", "minimal", "geometric", "badge", "monogram"]).default("flat"),
  colors: z.string().trim().max(120).optional().default("pink and cyan"),
  turnstileToken: z.string().max(2048).optional(),
});

const STYLE_HINTS: Record<string, string> = {
  flat: "flat, bold, simple shapes, solid fills",
  minimal: "minimal, lots of negative space, one or two shapes",
  geometric: "geometric, built from circles, triangles and rectangles",
  badge: "circular badge emblem with a clean border ring",
  monogram: "monogram built from abstract letterforms the prompt names, nothing else",
};

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
  const { prompt, style, colors, turnstileToken } = parsed.data;

  const blocked = findBlocked(prompt);
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
        { error: `Daily limit reached (${quota} logos per day on your plan). Please try again tomorrow.` },
        { status: 429, headers: rateLimitHeaders(0, quota) }
      );
    }
  } else {
    rl = await checkAiRateLimit(ip, "logo");
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Daily free limit reached (10 logos per day). Please try again tomorrow." },
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

  // Server-side retry (max 3 attempts): gpt-oss-20b sometimes returns
  // unusable output and the route previously answered 502 on the first
  // miss. Retrying is honest — it never fabricates a logo, it just asks
  // the model again. After 3 misses the honest 502 remains.
  let lastSvg: string | null = null;
  for (let attempt = 0; attempt < 3 && !lastSvg; attempt++) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          temperature: 0.7,
          max_tokens: 2048,
          messages: [
            {
              role: "system",
              content:
                "You design original logos and return ONLY raw SVG markup, no markdown, no explanation. " +
                "Style: " + STYLE_HINTS[style] + ". Palette: " + colors + ". " +
                "Rules: completely original geometry, never copy an existing logo; no text unless the user asked for initials; " +
                "no gradients abused as fills everywhere; viewBox 0 0 512 512; only svg, g, path, circle, rect, ellipse, polygon, polyline, line, defs, linearGradient, radialGradient and stop elements.",
            },
            { role: "user", content: `Logo concept: ${prompt}` },
          ],
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content ?? "";
      lastSvg = sanitizeSvg(content);
    } catch {
      // Retry; the honest 502 below covers a full failure.
    }
  }
  if (!lastSvg) {
    await logJob({ userId, tool: "logo", status: "FAILED", errorCode: "GROQ_UNUSABLE" });
    return NextResponse.json({ error: "The AI response was not a usable logo. Please try again." }, { status: 502 });
  }
  await logJob({ userId, tool: "logo", status: "SUCCESS", costEstimate: parseFloat(await getSetting("groqCostPerJobUsd")) || 0.001 });
  return NextResponse.json({ svg: lastSvg }, { headers: rateLimitHeaders(rl.remaining, rl.limit) });
}
