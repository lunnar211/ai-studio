// Create an async colorize / restore job (Phase 1, P0-fixed).
//
// Modes (exactly 3, sent as `mode` in the form data):
//   enhance            -> handled by /api/enhance, never here.
//   colorize           -> colorize, then upscale (Real-ESRGAN step).
//   restore            -> face/scratch restore FIRST, then colorize
//                         (grayscale photos only), then upscale.
// The job runs as a state machine driven by client polling
// (GET /api/photo/jobs/[id]) because image jobs can outlast the
// 60s Vercel function limit. This route only validates, prepares the
// AI-sized input, starts the FIRST prediction, and stores the job.
// Credits: Enhance-style accounting — guests consume at creation,
// signed-in users at successful completion (AiUsageLog).
//
// P0 rules enforced here:
// - AI input is resized to max 1536px BEFORE any model call (speed).
// - Independent steps (normalize + file-kind check) run via Promise.all;
//   dependent model steps stay sequential (restore -> colorize ->
//   upscale), because each needs the previous step's output.
// - Every client-facing message is GENERIC: no provider name, no model
//   slug, no env var name, no raw error text. Real errors go to
//   console.error (server logs) only.
// - 5 requests/minute per IP (Upstash 60s window, or in-memory
//   fallback that does not persist across serverless instances).
// - Restore is best-effort: when the restore model is unconfigured or
//   its start fails, the job still colorizes/upscales and carries an
//   honest notice (stored in deliveredAs, shown with the result) —
//   never a fake restore, never a silent skip.
// - Grayscale gate (server-measured): Colorize on a colour photo is
//   refused; Restore never refuses (colour photos skip colorize).

import { NextResponse } from "next/server";
import { z } from "zod";
import { detectImageKind } from "@/lib/file-validate";
import { checkMinuteRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getSessionSafe } from "@/lib/auth";
import { getSetting, getSettings, isIpBlocked } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { checkGuestPhotoCredits, checkPhotoCredits, PHOTO_CREDIT_COST, type PhotoMode } from "@/lib/ai/credits";
import { analyzeImageLocal } from "@/lib/ai/image-analysis";
import { prepareAiInput } from "@/lib/ai/colorize";
import { routeColorizeStart, routeRestoreStart, routeUpscaleStart, type AiError } from "@/lib/ai/router";
import { colorizeModel } from "@/lib/ai/adapters/replicate";
import { colorizeAttemptOrder } from "@/lib/ai/tiers";
import { spaceConfigured, spaceId, startSpaceColorize, SpaceError } from "@/lib/ai/gradio";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

const Body = z.object({
  mode: z.enum(["colorize", "restore"]),
  style: z.enum(["natural", "vivid", "warm", "cool"]).default("natural"),
  era: z.enum(["", "1900s-1940s", "1950s-1970s", "1980s+"]).default(""),
  intensity: z.coerce.number().int().min(0).max(100).default(70),
  outputFormat: z.enum(["png", "jpg", "webp"]).default("jpg"),
  outputQuality: z.coerce.number().int().min(10).max(100).default(85),
  scale: z.coerce.number().int().pipe(z.union([z.literal(2), z.literal(4)])).default(2),
  faceEnhance: z.enum(["true", "false"]).default("false"),
});

const GENERIC_UNAVAILABLE = "Colorize is unavailable right now. Please try again later, or use Enhance only.";
const GENERIC_FAILED = "Colorize is unavailable right now. Please try again later, or use Enhance only.";

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
  const minute = await checkMinuteRateLimit(ip, "photo-colorize", 5);
  if (!minute.ok) {
    return NextResponse.json({ error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
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
    return NextResponse.json({ error: "Invalid options. Please check the form and try again." }, { status: 400 });
  }
  const opts = parsed.data;
  const faceEnhance = opts.faceEnhance === "true";
  const mode: PhotoMode = opts.mode;

  // Premium-only gates (server-enforced, not just UI-disabled).
  if (userPlan === "FREE" && opts.scale === 4) {
    return NextResponse.json({ error: "HD 4x upscaling is a Premium feature. Choose 2x, or upgrade to Premium." }, { status: 400 });
  }
  if (userPlan === "FREE" && faceEnhance) {
    return NextResponse.json({ error: "Face enhance is a Premium feature. Turn it off, or upgrade to Premium." }, { status: 400 });
  }

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

  // Independent steps in parallel: AI-sized input prep + magic-byte
  // file-kind check (both read the raw buffer; neither needs the other).
  let aiInput: { buffer: Buffer; width: number; height: number };
  try {
    const [prepared] = await Promise.all([
      prepareAiInput(buf),
      Promise.resolve(detectImageKind(buf)),
    ]);
    aiInput = prepared;
  } catch (err) {
    console.error("photo/colorize: input preparation failed", err);
    return NextResponse.json({ error: "Could not read that image. Please try another file." }, { status: 400 });
  }
  const kind = detectImageKind(buf);
  if (!kind) {
    return NextResponse.json({ error: "That file is not a valid JPG, PNG or WebP image." }, { status: 400 });
  }

  // Server-measured grayscale — the UI warns, the server decides.
  let local;
  try {
    local = await analyzeImageLocal(aiInput.buffer);
  } catch (err) {
    console.error("photo/colorize: image analysis failed", err);
    return NextResponse.json({ error: "Could not read that image. Please try another file." }, { status: 400 });
  }
  if (opts.mode === "colorize" && !local.isGrayscale) {
    return NextResponse.json(
      {
        error: "This looks like a colour photo already, so there is nothing to colorize. Choose Enhance only instead.",
        suggestMode: "enhance",
      },
      { status: 400 }
    );
  }
  // Restore colorizes grayscale photos and skips colorize for colour ones.
  const willColorize = opts.mode === "colorize" || local.isGrayscale;

  if (!prisma) {
    return NextResponse.json({ error: "Colorize is unavailable right now. Please try Enhance only for now." }, { status: 503 });
  }

  // Start the first prediction, then store the job.
  // Restore mode: the restore prediction runs FIRST (stage "restoring");
  // its output becomes the colorize input when the job is polled.
  // When restore is unconfigured or its start fails, the job proceeds
  // to colorize/upscale with an honest notice — never a fake restore.
  let predictionId = "";
  let firstStage = "";
  let tierProvider: string | null = null;
  let tierModel: string | null = null;
  let restoreNotice: string | null = null;
  try {
    if (opts.mode === "restore") {
      try {
        const started = await routeRestoreStart({ image: aiInput.buffer, kind: "jpeg" });
        predictionId = started.predictionId;
        tierProvider = "replicate";
        tierModel = null;
        firstStage = "restoring";
      } catch (err) {
        console.error("photo/colorize: restore start failed, continuing to colorize", err);
        restoreNotice = willColorize
          ? "Face and scratch restoration was unavailable for this photo, so it was colorized and upscaled instead."
          : "Face and scratch restoration was unavailable for this photo, so it was upscaled instead.";
      }
    }
    if (!predictionId) {
      if (willColorize) {
        let lastErr: unknown = null;
        let sawNotConfigured = false;
        // Server tiers in plan order (Free: Space first, then image
        // pool; Premium: image pool first, then Space). A failed tier
        // falls through to the next; no dead job is stored if all fail.
        // (Tier A, browser colorize, runs client-side before this route
        // for Free users and after it for Premium users; see tiers.ts.)
        const allSettings = await getSettings();
        const hfToggleOff = allSettings["ai.provider.huggingface"] === "false";
        for (const tier of colorizeAttemptOrder(userPlan)) {
          try {
            if (tier === "space") {
              if (!spaceConfigured() || hfToggleOff) {
                sawNotConfigured = true;
                continue;
              }
              const started = await startSpaceColorize(aiInput.buffer, "image/jpeg");
              predictionId = started.eventId;
              tierProvider = "huggingface";
              tierModel = spaceId();
            } else {
              const started = await routeColorizeStart({ image: aiInput.buffer, kind: "jpeg", userId });
              predictionId = started.predictionId;
              tierProvider = "replicate";
              tierModel = colorizeModel();
            }
            firstStage = "colorizing";
            break;
          } catch (err) {
            lastErr = err;
            if (err instanceof SpaceError && err.code === "SPACE_NOT_CONFIGURED") sawNotConfigured = true;
            if ((err as AiError)?.code === "AI_NOT_CONFIGURED") sawNotConfigured = true;
          }
        }
        if (!tierProvider) {
          if (sawNotConfigured) {
            return NextResponse.json({ error: GENERIC_UNAVAILABLE }, { status: 503 });
          }
          console.error("photo/colorize: all colorize tiers failed", lastErr);
          throw lastErr ?? new Error("No colorize tier started.");
        }
      } else {
        const started = await routeUpscaleStart({ image: aiInput.buffer, kind: "jpeg", scale: opts.scale as 2 | 4, faceEnhance });
        predictionId = started.predictionId;
        firstStage = "upscaling";
      }
    }
  } catch (err) {
    const e = err as AiError;
    if (e?.code === "AI_NOT_CONFIGURED") {
      return NextResponse.json({ error: GENERIC_UNAVAILABLE }, { status: 503 });
    }
    if (e?.code === "AI_BUDGET_REACHED") {
      return NextResponse.json({ error: "The daily AI budget is reached. Please try again tomorrow." }, { status: 503 });
    }
    if (e?.rateLimited) {
      return NextResponse.json({ error: "The image service is busy right now. Please wait a minute and try again." }, { status: 429 });
    }
    console.error("photo/colorize: job start failed", err);
    return NextResponse.json({ error: GENERIC_FAILED }, { status: 502 });
  }

  const credits = PHOTO_CREDIT_COST[mode];
  let job;
  try {
    job = await prisma.photoJob.create({
      data: {
        userId,
        mode: opts.mode,
        // Status follows the first stage: a job that starts at upscale
        // (restore on a colour photo with no restore step) must poll
        // as UPSCALING, or the poller would look for a colorize
        // prediction that does not exist.
        status: firstStage === "upscaling" ? "UPSCALING" : "COLORIZING",
        stage: firstStage,
        style: opts.style,
        era: opts.era,
        intensity: opts.intensity,
        outputFormat: opts.outputFormat,
        outputQuality: opts.outputQuality,
        scale: opts.scale,
        faceEnhance,
        colorized: false,
        predictionId: firstStage === "upscaling" ? null : predictionId,
        upscalePredId: firstStage === "upscaling" ? predictionId : null,
        provider: tierProvider,
        model: tierModel,
        inputData: aiInput.buffer.toString("base64"),
        inputMime: "image/jpeg",
        credits,
        costEstimate: 0,
        deliveredAs: restoreNotice,
      },
    });
  } catch (err) {
    // Table missing (schema not pushed yet) or any DB error: honest 503.
    console.error("photo/colorize: job store failed", err);
    return NextResponse.json({ error: "Colorize is unavailable right now. Please try Enhance only for now." }, { status: 503 });
  }

  return NextResponse.json(
    {
      jobId: job.id,
      status: job.status,
      stage: job.stage,
      mode: opts.mode,
      willColorize,
      needsUpscale: true,
      credits,
      remaining: rl.remaining,
      budget: rl.budget,
      notice: restoreNotice,
    },
    { headers: rateLimitHeaders(rl.remaining, rl.budget) }
  );
}
