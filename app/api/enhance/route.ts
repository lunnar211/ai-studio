// Photo Enhance (Enhance-only mode) through the Phase 0 router.
//
// AI-first for Premium: the image provider runs first when configured
// and under the spend cap; the local Sharp pipeline runs ONLY if every
// image-provider call fails. FREE users never touch paid GPU at all:
// they get the local Sharp pipeline directly — unlimited, no credit
// check, no budget. The client sees ONLY the neutral quality badge
// (X-Quality: "ai" = AI Enhanced, "standard" = Standard) —
// never which engine, provider, or model ran, and never any env var
// name (P0 fix for the leaked "set REPLICATE_API_TOKEN" label).
// The only universal gate is the 5/min per-IP limiter.

import { NextResponse } from "next/server";
import { detectImageKind } from "@/lib/file-validate";
import { checkMinuteRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getSessionSafe } from "@/lib/auth";
import { getSetting, isIpBlocked, logJob } from "@/lib/settings";
import { checkPhotoCredits } from "@/lib/ai/credits";
import { routeUpscale } from "@/lib/ai/router";
import { sharpEnhance } from "@/lib/ai/adapters/sharp-local";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

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
  const minute = await checkMinuteRateLimit(ip, "photo-enhance", 5);
  if (!minute.ok) {
    return NextResponse.json({ error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
  }

  // NO credit check for free paths (FREE + UNLIMITED model): free
  // Enhance runs the local Sharp pipeline below, which costs nothing
  // and is never budget-gated. Premium GPU jobs are budget-checked
  // after the file validates, just before the GPU call.
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

  try {
    // FREE: local Sharp pipeline directly — unlimited, no GPU, no budget.
    if (userPlan === "FREE") {
      const out = await sharpEnhance(buf, 2048);
      const meta = await sharp(out).metadata();
      await logJob({ userId, tool: "enhance", status: "SUCCESS", inputSummary: "enhance", costEstimate: 0 });
      return new NextResponse(new Uint8Array(out), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
          "X-Quality": "standard",
          "X-Output-Width": String(meta.width ?? 0),
          "X-Output-Height": String(meta.height ?? 0),
          ...rateLimitHeaders(minute.remaining, minute.limit),
        },
      });
    }
    // PREMIUM: GPU budget check, then GPU-first upscale (Sharp fallback
    // inside routeUpscale if every image call fails).
    if (userId) {
      const c = await checkPhotoCredits({ userId, plan: userPlan, mode: "enhance" });
      if (!c.ok) {
        return NextResponse.json(
          { error: "Premium GPU budget reached for today. The free Enhance route still works — it runs locally at standard quality." },
          { status: 429, headers: rateLimitHeaders(minute.remaining, minute.limit) }
        );
      }
    }
    const result = await routeUpscale({ image: buf, kind, scale: 2, userId, plan: userPlan });
    await logJob({
      userId,
      tool: "enhance",
      status: "SUCCESS",
      inputSummary: "enhance",
      costEstimate: result.costUsd,
    });
    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        // Neutral quality badge ONLY (P0): "ai" or "standard".
        "X-Quality": result.engine === "ai" ? "ai" : "standard",
        "X-Output-Width": String(result.width),
        "X-Output-Height": String(result.height),
        ...rateLimitHeaders(minute.remaining, minute.limit),
      },
    });
  } catch (err) {
    // Server log only — the client gets a generic message.
    console.error("api/enhance: enhancement failed", err);
    await logJob({ userId, tool: "enhance", status: "FAILED", inputSummary: "enhance", errorCode: "ENHANCE_FAILED" });
    return NextResponse.json({ error: "Could not enhance that image. Please try another file." }, { status: 400 });
  }
}
