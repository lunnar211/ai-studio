// Photo Enhance (Enhance-only mode) through the Phase 0 router.
//
// Replicate Real-ESRGAN first when configured and under the spend cap,
// Sharp fallback otherwise. The response header X-Engine says honestly
// which one ran: "ai" or "sharp". Credits: Enhance costs 1 photo
// credit (see lib/limits.ts). Signed-in budgets come from AiUsageLog;
// guests consume the per-IP bucket. Job rows are kept for history and
// as the pre-schema-push fallback count.

import { NextResponse } from "next/server";
import { detectImageKind } from "@/lib/file-validate";
import { getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getSessionSafe } from "@/lib/auth";
import { getSetting, isIpBlocked, logJob } from "@/lib/settings";
import { checkGuestPhotoCredits, checkPhotoCredits } from "@/lib/ai/credits";
import { routeUpscale } from "@/lib/ai/router";

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

  // Credit check (1 credit for Enhance). Signed-in users draw from the
  // shared photo-credit pool; guests draw from the per-IP bucket.
  let rl = { ok: true, remaining: 9, limit: 10 };
  if (userId) {
    const c = await checkPhotoCredits({ userId, plan: userPlan, mode: "enhance" });
    rl = { ok: c.ok, remaining: c.remaining, limit: c.budget };
    if (!c.ok) {
      const upgradeNote = userPlan === "FREE" ? ", or upgrade to Premium for 100 per day" : "";
      return NextResponse.json(
        { error: `Daily photo credit limit reached (${c.budget} credits per day on your plan). Please try again tomorrow${upgradeNote}.` },
        { status: 429, headers: rateLimitHeaders(0, c.budget) }
      );
    }
  } else {
    const c = await checkGuestPhotoCredits(req, "enhance");
    rl = { ok: c.ok, remaining: c.remaining, limit: c.budget };
    if (!c.ok) {
      return NextResponse.json(
        { error: `Daily free limit reached (${c.budget} photo credits per day). Please try again tomorrow, or upgrade to Premium for 100 per day.` },
        { status: 429, headers: rateLimitHeaders(c.remaining, c.budget) }
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

  try {
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
        "X-Engine": result.engine,
        "X-Output-Width": String(result.width),
        "X-Output-Height": String(result.height),
        ...rateLimitHeaders(rl.remaining, rl.limit),
      },
    });
  } catch {
    await logJob({ userId, tool: "enhance", status: "FAILED", inputSummary: "enhance", errorCode: "ENHANCE_FAILED" });
    return NextResponse.json({ error: "Could not enhance that image. Please try another file." }, { status: 400 });
  }
}
