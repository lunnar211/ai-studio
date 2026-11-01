// Create an async colorize / restore / colorize+HD job (Phase 1).
//
// The job runs as a state machine driven by client polling
// (GET /api/photo/jobs/[id]) because Replicate jobs can outlast the
// 60s Vercel function limit. This route only validates, normalizes,
// checks grayscale, starts the FIRST prediction, and stores the job.
// Credits: Enhance-style accounting — guests consume at creation,
// signed-in users at successful completion (AiUsageLog).
//
// Honesty gates enforced here (not just in the UI):
// - Colorize on a colour photo is refused (server-measured grayscale).
// - HD 4x and face enhance are Premium-only.
// - No Replicate key / tripped breaker / spend cap / missing PhotoJob
//   table => honest 503, never a fake colour.

import { NextResponse } from "next/server";
import { z } from "zod";
import { detectImageKind } from "@/lib/file-validate";
import { getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getSessionSafe } from "@/lib/auth";
import { getSetting, isIpBlocked } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { checkGuestPhotoCredits, checkPhotoCredits, PHOTO_CREDIT_COST, type PhotoMode } from "@/lib/ai/credits";
import { analyzeImageLocal } from "@/lib/ai/image-analysis";
import { normalizeUpload } from "@/lib/ai/colorize";
import { routeColorizeStart, routeUpscaleStart, type AiError } from "@/lib/ai/router";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

const Body = z.object({
  mode: z.enum(["colorize", "colorize-hd", "restore"]),
  style: z.enum(["natural", "vivid", "warm", "cool"]).default("natural"),
  era: z.enum(["", "1900s-1940s", "1950s-1970s", "1980s+"]).default(""),
  intensity: z.coerce.number().int().min(0).max(100).default(70),
  outputFormat: z.enum(["png", "jpg", "webp"]).default("jpg"),
  outputQuality: z.coerce.number().int().min(10).max(100).default(85),
  scale: z.coerce.number().int().pipe(z.union([z.literal(2), z.literal(4)])).default(2),
  faceEnhance: z.enum(["true", "false"]).default("false"),
});

function toPhotoMode(mode: string): PhotoMode {
  return mode === "colorize-hd" ? "colorize-hd" : mode === "restore" ? "restore" : "colorize";
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
  const parsed = Body.safeParse({
    mode: form.get("mode") ?? "colorize",
    style: form.get("style") ?? "natural",
    era: form.get("era") ?? "",
    intensity: form.get("intensity") ?? "70",
    outputFormat: form.get("outputFormat") ?? "jpg",
    outputQuality: form.get("outputQuality") ?? "85",
    scale: form.get("scale") ?? "2",
    faceEnhance: form.get("faceEnhance") ?? "false",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid colorize options. Please check the form and try again." }, { status: 400 });
  }
  const opts = parsed.data;
  const faceEnhance = opts.faceEnhance === "true";
  const mode = toPhotoMode(opts.mode);

  // Premium-only gates (server-enforced, not just UI-disabled).
  if (userPlan === "FREE" && opts.scale === 4) {
    return NextResponse.json({ error: "HD 4x upscaling is a Premium feature. Choose 2x, or upgrade to Premium." }, { status: 400 });
  }
  if (userPlan === "FREE" && faceEnhance) {
    return NextResponse.json({ error: "Face enhance is a Premium feature. Turn it off, or upgrade to Premium." }, { status: 400 });
  }
  const needsUpscale = opts.mode === "colorize-hd" || opts.mode === "restore";

  // Credit check (cost shown in the UI before the click).
  let rl = { remaining: 0, budget: 0 };
  if (userId) {
    const c = await checkPhotoCredits({ userId, plan: userPlan, mode });
    rl = { remaining: c.remaining, budget: c.budget };
    if (!c.ok) {
      return NextResponse.json(
        { error: `Daily photo credit limit reached (${c.budget} credits per day on your plan). Please try again tomorrow.` },
        { status: 429, headers: rateLimitHeaders(0, c.budget) }
      );
    }
  } else {
    const c = await checkGuestPhotoCredits(req, mode);
    rl = { remaining: c.remaining, budget: c.budget };
    if (!c.ok) {
      return NextResponse.json(
        { error: `Daily free limit reached (${c.budget} photo credits per day). Please try again tomorrow, or upgrade to Premium for 100 per day.` },
        { status: 429, headers: rateLimitHeaders(c.remaining, c.budget) }
      );
    }
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

  // Normalize (orientation fix, EXIF stripped, transparency flattened)
  // then measure grayscale on the server — the UI warns, the server decides.
  let normalized;
  try {
    normalized = await normalizeUpload(buf);
  } catch {
    return NextResponse.json({ error: "Could not read that image. Please try another file." }, { status: 400 });
  }
  let local;
  try {
    local = await analyzeImageLocal(normalized.buffer);
  } catch {
    return NextResponse.json({ error: "Could not read that image. Please try another file." }, { status: 400 });
  }
  if ((opts.mode === "colorize" || opts.mode === "colorize-hd") && !local.isGrayscale) {
    return NextResponse.json(
      {
        error: "This looks like a colour photo already, so there is nothing to colorize. Choose Enhance only instead.",
        suggestMode: "enhance",
      },
      { status: 400 }
    );
  }
  // Restore colorizes grayscale photos and skips colorize for colour ones.
  const willColorize = opts.mode === "colorize" || opts.mode === "colorize-hd" || local.isGrayscale;

  if (!prisma) {
    return NextResponse.json({ error: "Photo jobs need a database setup that is not finished yet. Please try Enhance only for now." }, { status: 503 });
  }

  // Start the first prediction, then store the job. If Replicate is
  // down/unconfigured/capped, the router throws an honest error and
  // no dead job is stored.
  let predictionId: string;
  let firstStage: string;
  try {
    if (willColorize) {
      const started = await routeColorizeStart({ image: normalized.buffer, kind: "jpeg", userId });
      predictionId = started.predictionId;
      firstStage = "colorizing";
    } else {
      const started = await routeUpscaleStart({ image: normalized.buffer, kind: "jpeg", scale: opts.scale as 2 | 4, faceEnhance });
      predictionId = started.predictionId;
      firstStage = "upscaling";
    }
  } catch (err) {
    const e = err as AiError;
    if (e?.code === "AI_NOT_CONFIGURED") {
      return NextResponse.json({ error: "Colorize is unavailable right now: the image model is not configured. Please try Enhance only, or try again later." }, { status: 503 });
    }
    if (e?.code === "AI_BUDGET_REACHED") {
      return NextResponse.json({ error: e.message ?? "The daily AI budget is reached. Please try again tomorrow." }, { status: 503 });
    }
    if (e?.rateLimited) {
      return NextResponse.json({ error: "The image service is busy right now (rate limited). Please wait a minute and try again." }, { status: 429 });
    }
    return NextResponse.json({ error: "Colorize is unavailable right now. Please try again later, or use Enhance only." }, { status: 502 });
  }

  const credits = PHOTO_CREDIT_COST[mode];
  let job;
  try {
    job = await prisma.photoJob.create({
      data: {
        userId,
        mode: opts.mode,
        status: willColorize ? "COLORIZING" : "UPSCALING",
        stage: firstStage,
        style: opts.style,
        era: opts.era,
        intensity: opts.intensity,
        outputFormat: opts.outputFormat,
        outputQuality: opts.outputQuality,
        scale: opts.scale,
        faceEnhance,
        colorized: false,
        predictionId: willColorize ? predictionId : null,
        upscalePredId: willColorize ? null : predictionId,
        inputData: normalized.buffer.toString("base64"),
        inputMime: "image/jpeg",
        credits,
        costEstimate: 0,
      },
    });
  } catch {
    // Table missing (schema not pushed yet) or any DB error: honest 503.
    return NextResponse.json({ error: "Photo jobs need a one-time database setup that has not run yet. Please try Enhance only for now." }, { status: 503 });
  }

  return NextResponse.json(
    {
      jobId: job.id,
      status: job.status,
      stage: job.stage,
      mode: opts.mode,
      willColorize,
      needsUpscale,
      credits,
      remaining: rl.remaining,
      budget: rl.budget,
    },
    { headers: rateLimitHeaders(rl.remaining, rl.budget) }
  );
}
