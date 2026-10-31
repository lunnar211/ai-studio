import { NextResponse } from "next/server";
import sharp from "sharp";
import { detectImageKind } from "@/lib/file-validate";
import { checkAiRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

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
    if (!url || typeof url !== "string" || !url.startsWith("https://")) return null;
    const img = await fetch(url);
    if (!img.ok) return null;
    return Buffer.from(await img.arrayBuffer());
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = await checkAiRateLimit(ip, "enhance");
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Daily free limit reached (10 enhancements per day). Please try again tomorrow." },
      { status: 429, headers: rateLimitHeaders(rl.remaining, rl.limit) }
    );
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
    return NextResponse.json({ error: "Could not enhance that image. Please try another file." }, { status: 400 });
  }
}
