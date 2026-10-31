import { NextResponse } from "next/server";
import { z } from "zod";
import { sanitizeSvg } from "@/lib/svg-sanitize";
import { findBlockedTerm } from "@/lib/blocklist";
import { checkAiRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

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

  const blocked = findBlockedTerm(prompt);
  if (blocked) {
    return NextResponse.json(
      { error: "That prompt was refused because it references an existing brand, character or public figure. Please describe an original logo concept instead." },
      { status: 400 }
    );
  }

  const ip = getClientIp(req);
  const rl = await checkAiRateLimit(ip, "logo");
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Daily free limit reached (10 logos per day). Please try again tomorrow." },
      { status: 429, headers: rateLimitHeaders(rl.remaining, rl.limit) }
    );
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
    if (!res.ok) {
      return NextResponse.json({ error: "Logo generation is unavailable right now. Please try again." }, { status: 502 });
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    const svg = sanitizeSvg(content);
    if (!svg) {
      return NextResponse.json({ error: "The AI response was not a usable logo. Please try again." }, { status: 502 });
    }
    return NextResponse.json({ svg }, { headers: rateLimitHeaders(rl.remaining, rl.limit) });
  } catch {
    return NextResponse.json({ error: "Logo generation is unavailable right now. Please try again." }, { status: 502 });
  }
}
