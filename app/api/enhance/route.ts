import { NextResponse } from "next/server";
import sharp from "sharp";
import { detectImageKind } from "@/lib/file-validate";
import { checkAiRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getSessionSafe } from "@/lib/auth";
import { countJobsToday, dailyQuota, getSetting, isIpBlocked, logJob } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

async function sharpEnhance(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  return sharp(input)
    .resize(Math.min(w * 2, 4096), Math.min(h * 2, 4096), { kernel: "lanczos3", withoutEnlargement: false })
    .sharpen({ sigma: 1.2, m1: 1.0, m2: 2.0 })
    .normalize()
    .png()
    .toBuffer();
}

async function replicateEnhance(input: Buffer, kind: string): Promise<Buffer | null> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return null;
  try {
    const mime = kind === "png" ? "image/png" : kind === "webp" ? "image/webp" : "image/jpeg";
    const dataUri = `data:${mime};base64,${input.toString("base64")}`;
    const create = await fetch("https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait" },
      body: JSON.stringify({ input: { image: dataUri, scale: 2, face_enhance: false } }),
    });
    if (!create.ok) return null;
    let pred = (await create.json()) as { id?: string; status?: string; output?: unknown };
    const deadline = Date.now() + 50000;
    while (pred.status === "starting" || pred.status === "processing") {
      if (Date.now() > deadline || !pred.id) return null;
      await new Promise((r) => setTimeout(r, 2500));
      const poll = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!poll.ok) return null;
      pred = (await poll.json()) as typeof pred;
    }
    const out = pred.output;
    const url = Array.isArray(out) ? out[out.length - 1] : typeof out === "string" ? out : null;
    if (!url || typeof url !== "string") return null;
    // SSRF guard: Replicate outputs live on replicate.delivery only. Any
    // other host is refused (falls back to the Sharp pipeline, never fetched).
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:" || (parsed.hostname !== "replicate.delivery" && !parsed.hostname.endsWith(".replicate.delivery"))) {
      return null;
    }
    const img = await fetch(url);
    if (!img.ok) return null;
    return Buffer.from(await img.arrayBuffer());
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if ((await getSetting("enhanceEnabled")) !== "true") {
    return NextResponse.json({ error: "The photo enhancer is temporarily disabled." }, { status: 503 });
  }
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
    const quota = await dailyQuota("enhance", userPlan as "FREE" | "PREMIUM");
    const used = await countJobsToday(userId, "enhance");
    rl = { ok: used < quota, remaining: Math.max(0, quota - used - 1), limit: quota };
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Daily limit reached (${quota} enhancements per day on your plan). Please try again tomorrow.` },
        { status: 429, headers: rateLimitHeaders(0, quota) }
      );
    }
  } else {
    rl = await checkAiRateLimit(ip, "enhance");
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Daily free limit reached (10 enhancements per day). Please try again tomorrow." },
        { status: 429, headers: rateLimitHeaders(rl.remaining, rl.limit) }
      );
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Please upload an image file." }, { status: 400 });
  }
  const token = form.get("turnstileToken");
  if (!(await verifyTurnstile(typeof token === "string" ? token : null))) {
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 400 });
  }
  const file = form.get("image");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Please upload a JPG, PNG or WebP image under 10 MB." }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be under 10 MB." }, { status: 400 });
  }
  const kind = detectImageKind(buf);
  if (!kind) {
    return NextResponse.json({ error: "That file is not a valid JPG, PNG or WebP image." }, { status: 400 });
  }

  // AI first; any Replicate failure falls back to the Sharp pipeline and is
  // labelled honestly as standard quality, never as AI.
  const ai = await replicateEnhance(buf, kind);
  try {
    if (ai) {
      const meta = await sharp(ai).metadata();
      await logJob({ userId, tool: "enhance", status: "SUCCESS", costEstimate: parseFloat(await getSetting("replicateCostPerJobUsd")) || 0.01 });
      return new NextResponse(new Uint8Array(ai), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
          "X-Engine": "ai",
          "X-Output-Width": String(meta.width ?? ""),
          "X-Output-Height": String(meta.height ?? ""),
          ...rateLimitHeaders(rl.remaining, rl.limit),
        },
      });
    }
    const out = await sharpEnhance(buf);
    const meta = await sharp(out).metadata();
    await logJob({ userId, tool: "enhance", status: "SUCCESS", costEstimate: 0 });
    return new NextResponse(new Uint8Array(out), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "X-Engine": "sharp",
        "X-Output-Width": String(meta.width ?? ""),
        "X-Output-Height": String(meta.height ?? ""),
        ...rateLimitHeaders(rl.remaining, rl.limit),
      },
    });
  } catch {
    await logJob({ userId, tool: "enhance", status: "FAILED", errorCode: "ENHANCE_FAILED" });
    return NextResponse.json({ error: "Could not enhance that image. Please try another file." }, { status: 400 });
  }
}
