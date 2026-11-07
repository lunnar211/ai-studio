// Create an async colorize / restore job (Phase 1, P0-fixed, free-unlimited).
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
// Credits (FREE + UNLIMITED model): free jobs (Space, Sharp)
// cost 0 and are never budget-checked; only a Premium paid-GPU start
// consumes the Premium GPU budget, and over budget Premium falls back
// to the free Space instead of blocking. Free users never reach paid
// GPU (see lib/ai/tiers.ts).
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
import sharp from "sharp";
import { detectImageKind } from "@/lib/file-validate";
import { checkMinuteRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getSessionSafe } from "@/lib/auth";
import { getSetting, getSettings, isIpBlocked } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { checkPhotoCredits, PHOTO_CREDIT_COST, type PhotoMode } from "@/lib/ai/credits";
import { analyzeImageLocal } from "@/lib/ai/image-analysis";
import { shouldRefuseColorize } from "@/lib/ai/grayscale-gate";
import { prepareAiInput } from "@/lib/ai/colorize";
import { sharpRestore } from "@/lib/ai/adapters/sharp-local";
import { routeColorizeStart, routeRestoreStart, routeUpscaleStart, type AiError } from "@/lib/ai/router";
import { colorizeModel } from "@/lib/ai/adapters/replicate";
import {
  GEMINI_PENDING_PREDICTION_ID,
  geminiImageConfigured,
  geminiImageModel,
} from "@/lib/ai/adapters/gemini-image";
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
  // User override for the grayscale gate: faded/sepia photos are often
  // measured as "colour" but are exactly what users want colorized.
  // When true, the server never refuses a colorize job on gate grounds.
  colorizeAnyway: z.enum(["true", "false"]).default("false"),
});

const GENERIC_UNAVAILABLE = "Colorize is not available right now \u2014 the server is not set up yet. Free Enhance can still sharpen and upscale this photo.";
const GENERIC_FAILED = "Colorize is unavailable right now. Please try again later. Free Enhance can still sharpen and upscale this photo.";

export async function GET() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
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
    colorizeAnyway: form.get("colorizeAnyway") ?? "false",
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

  // NO upfront credit check anymore (FREE + UNLIMITED model): free
  // jobs never consume anything, and Premium GPU jobs are only
  // budget-checked when a paid-GPU tier is actually about to start
  // (below). The only universal gate is the 5/min per-IP limiter above.
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
  // The gate applies to COLORIZE only: a colour photo in Restore mode
  // is a legitimate job (repair + upscale, no colorize), so it must
  // reach the restore branches below instead of being refused here.
  let local;
  try {
    local = await analyzeImageLocal(aiInput.buffer);
  } catch (err) {
    console.error("photo/colorize: image analysis failed", err);
    return NextResponse.json({ error: "Could not read that image. Please try another file." }, { status: 400 });
  }
  if (mode === "colorize" && shouldRefuseColorize({ isGrayscale: local.isGrayscale, colorizeAnyway: opts.colorizeAnyway === "true" })) {
    return NextResponse.json(
      {
        error: "This looks like a colour photo already, so there is nothing to colorize. Choose Enhance only instead, or use “Colorize anyway” if it is a faded or sepia old photo.",
        suggestMode: "enhance",
      },
      { status: 400 }
    );
  }
  // Restore colorizes grayscale photos and skips colorize for colour ones.
  // The explicit "Colorize anyway" override also counts here, so a
  // user who knows their faded/sepia photo is B&W gets colorize on
  // the server path too.
  const willColorize =
    opts.mode === "colorize" || local.isGrayscale || opts.colorizeAnyway === "true";

  // FREE colour-restore has no free server step: model repair is a
  // paid-GPU feature and free users are never routed to paid GPU.
  // Instead of a dead end, the UI offers free Enhance (sharpen +
  // upscale) for these photos — the honest free equivalent.
  if (userPlan === "FREE" && opts.mode === "restore" && !willColorize) {
    return NextResponse.json(
      {
        error: "This looks like a colour photo, so there is nothing to colorize and model face/scratch repair is not on the free route. Free Enhance can sharpen and upscale it instead.",
        freeAlternative: "enhance",
      },
      { status: 503 }
    );
  }

  if (!prisma) {
    // No database: async colorize jobs have nowhere to live, so the
    // server path is honestly unavailable — but never a dead end:
    // the UI offers free Enhance.
    return NextResponse.json(
      {
        error: GENERIC_UNAVAILABLE,
        freeAlternative: "enhance",
      },
      { status: 503 }
    );
  }

  // Start the first prediction, then store the job.
  //
  // TIER-AWARE CREDITS (FREE + UNLIMITED model): credits are decided by
  // the tier that ACTUALLY starts, not upfront. Free jobs (Space,
  // Sharp) cost 0 credits and are never budget-checked.
  // Only a Premium paid-GPU start consumes the GPU budget — and when
  // that budget is reached, Premium falls back to the free Space
  // instead of blocking. Free users never reach the paid-GPU
  // (Replicate) branch at all. The Gemini tier is the one exception
  // to "free costs nothing": it bills the owner's Gemini account
  // ~$0.041 per photo (owner-authorized 2026-11-01, see tiers.ts),
  // recorded as the job's cost estimate — never as user credits.
  //
  // Restore mode: the restore prediction runs FIRST (stage
  // "restoring") for Premium only; its output becomes the colorize
  // input when the job is polled. For FREE restore, the model repair
  // step is skipped (it is paid-GPU-only) and a local cleanup
  // (denoise + sharpen, honestly NOT face/scratch inpainting) runs
  // instead, with a notice saying exactly that — never a fake restore.
  // When restore is unconfigured or its start fails, the job proceeds
  // to colorize/upscale with an honest notice.
  let predictionId = "";
  let firstStage = "";
  let tierProvider: string | null = null;
  let tierModel: string | null = null;
  let tierUsed: "replicate" | "space" | "gemini" | null = null;
  let restoreNotice: string | null = null;
  let colorizeInput = aiInput.buffer;
  // Premium GPU budget, checked lazily only when a paid-GPU tier is
  // about to start (never for free paths, never for guests).
  const premiumGpuBudgetOk = async (): Promise<boolean> => {
    if (userPlan !== "PREMIUM" || !userId) return false;
    try {
      return (await checkPhotoCredits({ userId, plan: userPlan, mode })).ok;
    } catch {
      return false;
    }
  };
  try {
    if (opts.mode === "restore") {
      if (userPlan === "PREMIUM" && (await premiumGpuBudgetOk())) {
        try {
          const started = await routeRestoreStart({ image: aiInput.buffer, kind: "jpeg" });
          predictionId = started.predictionId;
          tierProvider = "replicate";
          tierModel = null;
          tierUsed = "replicate";
          firstStage = "restoring";
        } catch (err) {
          console.error("photo/colorize: restore start failed, continuing to colorize", err);
          restoreNotice = willColorize
            ? "Face and scratch restoration was unavailable for this photo, so it was colorized and upscaled instead."
            : "Face and scratch restoration was unavailable for this photo, so it was upscaled instead.";
        }
      } else if (userPlan === "FREE" && willColorize) {
        // Free restore: local cleanup only (denoise + sharpen). This
        // does NOT inpaint scratches or restore faces — the notice says
        // so, and the result's Details line repeats it.
        try {
          const cleaned = await sharpRestore(aiInput.buffer);
          colorizeInput = await sharp(cleaned).jpeg({ quality: 92 }).toBuffer();
          restoreNotice =
            "Free restore cleaned up this photo (denoise + sharpen) before colorizing. Model face and scratch repair is a Premium server feature and was not applied.";
        } catch (err) {
          console.error("photo/colorize: free restore cleanup failed, continuing to colorize", err);
          restoreNotice =
            "Model face and scratch repair is a Premium server feature and was not applied on this free job, so it was colorized and upscaled instead.";
        }
      } else if (userPlan === "PREMIUM") {
        restoreNotice = willColorize
          ? "Face and scratch restoration was unavailable for this photo, so it was colorized and upscaled instead."
          : "Face and scratch restoration was unavailable for this photo, so it was upscaled instead.";
      }
    }
    if (!predictionId) {
      if (willColorize) {
        let lastErr: unknown = null;
        let sawNotConfigured = false;
        // Server tiers in plan order (Free: Space, then Gemini;
        // Premium: paid GPU first, then Space, then Gemini). A failed
        // tier falls through to the next; no dead job is stored if
        // all fail. The Gemini tier records only an intent
        // here — the synchronous Nano Banana call runs on the
        // job's first COLORIZING poll, so this POST stays fast.
        const allSettings = await getSettings();
        const hfToggleOff = allSettings["ai.provider.huggingface"] === "false";
        const geminiToggleOff = allSettings["ai.provider.gemini"] === "false";
        for (const tier of colorizeAttemptOrder(userPlan)) {
          try {
            if (tier === "space") {
              if (!spaceConfigured() || hfToggleOff) {
                sawNotConfigured = true;
                continue;
              }
              const started = await startSpaceColorize(colorizeInput, "image/jpeg");
              predictionId = started.eventId;
              tierProvider = "huggingface";
              tierModel = spaceId();
              tierUsed = "space";
            } else if (tier === "gemini") {
              if (!geminiImageConfigured() || geminiToggleOff) {
                sawNotConfigured = true;
                continue;
              }
              predictionId = GEMINI_PENDING_PREDICTION_ID;
              tierProvider = "gemini";
              tierModel = geminiImageModel();
              tierUsed = "gemini";
            } else {
              // Paid GPU: Premium only, and only within its budget.
              // Over budget, fall through to the free Space — never block.
              if (!(await premiumGpuBudgetOk())) {
                sawNotConfigured = true;
                continue;
              }
              const started = await routeColorizeStart({ image: colorizeInput, kind: "jpeg", userId });
              predictionId = started.predictionId;
              tierProvider = "replicate";
              tierModel = colorizeModel();
              tierUsed = "replicate";
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
            return NextResponse.json({ error: GENERIC_UNAVAILABLE, freeAlternative: "enhance" }, { status: 503 });
          }
          console.error("photo/colorize: all colorize tiers failed", lastErr);
          throw lastErr ?? new Error("No colorize tier started.");
        }
      } else {
        // Colour restore (Premium only — FREE colour-restore returned
        // earlier with a free Enhance alternative): GPU upscale.
        const started = await routeUpscaleStart({ image: aiInput.buffer, kind: "jpeg", scale: opts.scale as 2 | 4, faceEnhance });
        predictionId = started.predictionId;
        tierUsed = "replicate";
        firstStage = "upscaling";
      }
    }
  } catch (err) {
    const e = err as AiError;
    if (e?.code === "AI_NOT_CONFIGURED") {
      return NextResponse.json({ error: GENERIC_UNAVAILABLE, freeAlternative: "enhance" }, { status: 503 });
    }
    if (e?.code === "AI_BUDGET_REACHED") {
      return NextResponse.json({ error: "The daily AI budget is reached. Please try again tomorrow." }, { status: 503 });
    }
    if (e?.rateLimited) {
      return NextResponse.json({ error: "The image service is busy right now. Please wait a minute and try again." }, { status: 429 });
    }
    console.error("photo/colorize: job start failed", err);
    return NextResponse.json({ error: GENERIC_FAILED, freeAlternative: "enhance" }, { status: 502 });
  }

  // Credits follow the tier that actually started: paid GPU charges
  // the Premium GPU budget; every free tier costs 0, always.
  const credits = tierUsed === "replicate" ? PHOTO_CREDIT_COST[mode] : 0;
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
        inputData: colorizeInput.toString("base64"),
        inputMime: "image/jpeg",
        credits,
        costEstimate: 0,
        deliveredAs: restoreNotice,
      },
    });
  } catch (err) {
    // Table missing (schema not pushed yet) or any DB error: honest 503,
    // with the free alternative so the UI never shows a dead end.
    console.error("photo/colorize: job store failed", err);
    return NextResponse.json(
      {
        error: GENERIC_UNAVAILABLE,
        freeAlternative: "enhance",
      },
      { status: 503 }
    );
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
      // Free jobs are unlimited: no remaining/budget numbers exist for
      // them. Premium GPU jobs still report their budget via the job
      // poll, not here — the UI never shows credit numbers on free paths.
      freeUnlimited: tierUsed !== "replicate",
      notice: restoreNotice,
    },
    { headers: rateLimitHeaders(minute.remaining, minute.limit) }
  );
}
