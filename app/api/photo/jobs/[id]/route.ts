// Poll + advance an async photo job (Phase 1, P0-fixed).
//
// Serverless functions stop at 60s, so the client polls every few
// seconds and THIS endpoint advances the job one step per call:
//   RESTORING (stage "restoring"): check the restore prediction; on
//     success the restored image becomes the new input, then the job
//     colorizes (grayscale, re-measured) or upscales (colour). On
//     failure it falls back to colorize/upscale with an honest notice.
//   COLORIZING: check the colorize tier that started the job — the
//     owner's HF Space (Tier B, polled by Gradio event id) or the
//     image pool (Tier C) — then LAB-merge (input L + model a/b) and
//     start the upscale step (every colorize/restore job upscales).
//   UPSCALING: check the upscale prediction; on success finalize.
//     On failure, fall back to the Sharp pipeline for the upscale step
//     only (labelled Standard — the colorize step is never faked).
// A transient poll error never fails the job; the client simply
// retries. The job id is a random cuid held by the client — that is
// the resume key. Signed-in jobs additionally require the owner.
//
// P0 PRIVACY RULE: publicState() is the ONLY shape ever returned to a
// client, and it contains NO engine, provider, or model — only the
// neutral quality badge ("ai" = AI Enhanced, "standard" = Standard)
// plus generic fields. Provider/model stay in the database row and
// server logs (admin/debug only), never in a response. Every error
// string here is generic; real errors go to console.error only.
//
// Privacy: inputData is cleared at every terminal state; resultData
// is cleared after 2 hours (polling then reports it expired).

import { NextResponse } from "next/server";
import sharp from "sharp";
import { checkAiRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { getSessionSafe } from "@/lib/auth";
import { getSettings, isIpBlocked, logJob } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { logAiUsage } from "@/lib/ai/usage";
import { publicJobState } from "@/lib/ai/public-job-state";
import { getImageProvider } from "@/lib/ai-pool";
import { sharpEnhance } from "@/lib/ai/adapters/sharp-local";
import { edgeCapForPlan, encodeResult, mergeColorized } from "@/lib/ai/colorize";
import { analyzeImageLocal } from "@/lib/ai/image-analysis";
import { routeColorizeStart, routeUpscaleStart, type AiError } from "@/lib/ai/router";
import { pollSpaceColorize, spaceConfigured, startSpaceColorize, SpaceError } from "@/lib/ai/gradio";
import { colorizeAttemptOrder } from "@/lib/ai/tiers";
import type { AiProviderId } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const RESULT_TTL_MS = 2 * 60 * 60 * 1000;
const JOB_TIMEOUT_MS = 30 * 60 * 1000;

type JobRow = NonNullable<Awaited<ReturnType<typeof loadJob>>>;

async function loadJob(id: string) {
  if (!prisma) return null;
  try {
    return await prisma.photoJob.findUnique({ where: { id } });
  } catch {
    return null;
  }
}

const publicState = publicJobState;

async function failJob(job: JobRow, errorCode: string, errorMessage: string) {
  if (!prisma) return;
  try {
    await prisma.photoJob.update({
      where: { id: job.id },
      data: { status: "FAILED", stage: "failed", errorCode, errorMessage, inputData: null },
    });
    await logJob({ userId: job.userId, tool: job.mode === "restore" ? "restore" : "colorize", status: "FAILED", inputSummary: job.mode, errorCode });
  } catch {
    // Job bookkeeping must never mask the user-facing error.
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionSafe();
  const sessionUserId = (session?.user as unknown as { id?: string } | undefined)?.id ?? null;
  const sessionPlan = (session?.user as unknown as { plan?: string } | undefined)?.plan === "PREMIUM" ? "PREMIUM" : "FREE";
  if ((session?.user as unknown as { status?: string } | undefined)?.status === "SUSPENDED") {
    return NextResponse.json({ error: "Account suspended." }, { status: 403 });
  }
  const ip = getClientIp(req);
  if (await isIpBlocked(ip)) {
    return NextResponse.json({ error: "Access from this network is blocked." }, { status: 403 });
  }
  const rl = await checkAiRateLimit(ip, "photo-poll", 600);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many status checks. Please wait a minute and try again." }, { status: 429, headers: rateLimitHeaders(rl.remaining, rl.limit) });
  }
  if (!prisma) {
    return NextResponse.json({ error: "Colorize is unavailable right now. Please try Enhance only for now." }, { status: 503 });
  }
  const job = await loadJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (job.userId && job.userId !== sessionUserId) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  // Terminal states.
  if (job.status === "CANCELED") return NextResponse.json(publicState(job));
  if (job.status === "FAILED") {
    return NextResponse.json(publicState(job, { error: job.errorMessage ?? "That job failed." }));
  }
  if (job.status === "SUCCEEDED") {
    const age = Date.now() - job.createdAt.getTime();
    if (age > RESULT_TTL_MS || !job.resultData) {
      try {
        await prisma.photoJob.update({ where: { id: job.id }, data: { resultData: null, inputData: null } });
      } catch {
        // Best effort.
      }
      return NextResponse.json(publicState(job, { expired: true, error: "This result expired (results are kept for 2 hours so files are not stored). Please run the job again." }));
    }
    return NextResponse.json(
      publicState(job, {
        resultData: job.resultData,
        resultMime: job.resultMime,
        resultWidth: job.resultWidth,
        resultHeight: job.resultHeight,
        deliveredAs: job.deliveredAs,
        message: `Done. Output ${job.resultWidth} x ${job.resultHeight}px.`,
      })
    );
  }

  // Stuck-job safety net: a job running over 30 minutes is failed so
  // the client never polls forever.
  if (Date.now() - job.createdAt.getTime() > JOB_TIMEOUT_MS) {
    await failJob(job, "JOB_TIMEOUT", "That job took too long and was stopped. Please try again with a smaller photo.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "That job took too long and was stopped. Please try again with a smaller photo." }));
  }

  try {
    if (job.status === "COLORIZING") {
      if (job.stage === "restoring") return await advanceRestoring(job, sessionPlan);
      return await advanceColorizing(job, sessionPlan);
    }
    if (job.status === "UPSCALING") {
      return await advanceUpscaling(job, sessionPlan);
    }
    return NextResponse.json(publicState(job));
  } catch (err) {
    // Transient poll errors (network blip, image-service hiccup) must
    // not fail the job: return the current state and let the client retry.
    const e = err as AiError;
    if (e?.code === "AI_NOT_CONFIGURED") {
      await failJob(job, "AI_NOT_CONFIGURED", "Colorize is unavailable right now. Please try again later, or use Enhance only.");
      return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Colorize is unavailable right now. Please try again later, or use Enhance only." }));
    }
    console.error("photo/jobs: transient poll error", err);
    return NextResponse.json(publicState(job));
  }
}

/** Start a colorize prediction for a job, following plan tier order. */
async function startColorizeForJob(
  job: JobRow,
  plan: "FREE" | "PREMIUM",
  input: Buffer
): Promise<{ predictionId: string; provider: string; model: string | null }> {
  const allSettings = await getSettings();
  const hfToggleOff = allSettings["ai.provider.huggingface"] === "false";
  let lastErr: unknown = null;
  for (const tier of colorizeAttemptOrder(plan)) {
    try {
      if (tier === "space") {
        if (!spaceConfigured() || hfToggleOff) continue;
        const started = await startSpaceColorize(input, "image/jpeg");
        return { predictionId: started.eventId, provider: "huggingface", model: null };
      }
      const started = await routeColorizeStart({ image: input, kind: "jpeg", userId: job.userId });
      return { predictionId: started.predictionId, provider: "replicate", model: null };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("No colorize tier started.");
}

async function advanceRestoring(job: JobRow, plan: "FREE" | "PREMIUM") {
  if (!job.predictionId) {
    await failJob(job, "NO_PREDICTION", "That job lost its reference. Please run it again.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "That job lost its reference. Please run it again." }));
  }
  const provider = getImageProvider();
  if (!provider) {
    await failJob(job, "AI_NOT_CONFIGURED", "Colorize is unavailable right now. Please try again later, or use Enhance only.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Colorize is unavailable right now. Please try again later, or use Enhance only." }));
  }
  let pred;
  try {
    pred = await provider.getPrediction(job.predictionId);
  } catch (err) {
    // Transient poll error: return current state, client retries.
    console.error("photo/jobs: restore poll error", err);
    return NextResponse.json(publicState(job));
  }
  if (pred.status === "starting" || pred.status === "processing") {
    return NextResponse.json(publicState(job));
  }
  if (pred.status !== "succeeded") {
    // Restore failed: fall back to colorize/upscale with an honest
    // notice (stored in deliveredAs, shown with the result) instead
    // of failing a job whose core steps can still succeed.
    console.error("photo/jobs: restore prediction failed, falling back");
    return await fallbackAfterRestoreFailure(job, plan);
  }
  const url = provider.outputUrl(pred);
  if (!url) {
    return await fallbackAfterRestoreFailure(job, plan);
  }
  let restored: Buffer;
  try {
    restored = await provider.fetchOutput(url);
  } catch (err) {
    console.error("photo/jobs: restore output fetch failed", err);
    return await fallbackAfterRestoreFailure(job, plan);
  }
  // Keep the colorize input at the 1536px AI size (speed rule).
  const resized = await sharp(restored).resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
  // Re-measure grayscale on the RESTORED image: a colour photo stays
  // colour (skip colorize, go to upscale); a B&W photo colorizes.
  let gray = true;
  try {
    gray = (await analyzeImageLocal(resized)).isGrayscale;
  } catch {
    gray = true;
  }
  if (!prisma) return NextResponse.json(publicState(job));
  if (!gray) {
    // Colour restore: no colorize step — start the upscale directly.
    try {
      const started = await routeUpscaleStart({ image: resized, kind: "jpeg", scale: job.scale as 2 | 4, faceEnhance: job.faceEnhance });
      const updated = await prisma.photoJob.update({
        where: { id: job.id },
        data: { status: "UPSCALING", stage: "upscaling", upscalePredId: started.predictionId, inputData: resized.toString("base64") },
      });
      return NextResponse.json(publicState(updated));
    } catch (err) {
      console.error("photo/jobs: upscale start after restore failed", err);
      await failJob(job, "UPSCALE_FAILED", "Upscaling failed for that photo. Your original is unchanged — please try again.");
      return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Upscaling failed for that photo. Your original is unchanged — please try again." }));
    }
  }
  // Grayscale restore: colorize next, with the restored image as input.
  try {
    const started = await startColorizeForJob(job, plan, resized);
    const updated = await prisma.photoJob.update({
      where: { id: job.id },
      data: { stage: "colorizing", predictionId: started.predictionId, provider: started.provider, model: started.model, inputData: resized.toString("base64") },
    });
    return NextResponse.json(publicState(updated));
  } catch (err) {
    console.error("photo/jobs: colorize start after restore failed", err);
    await failJob(job, "COLORIZE_FAILED", "Colorize did not work for that photo. Your original is unchanged — please try again later, or use Enhance only.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Colorize did not work for that photo. Your original is unchanged — please try again later, or use Enhance only." }));
  }
}

/** After a restore failure: colorize if grayscale, else upscale — with notice. */
async function fallbackAfterRestoreFailure(job: JobRow, plan: "FREE" | "PREMIUM") {
  if (!prisma) return NextResponse.json(publicState(job));
  const notice = "Face and scratch restoration could not be applied to this photo, so it was colorized and upscaled instead.";
  const input = job.inputData ? Buffer.from(job.inputData, "base64") : null;
  if (!input) {
    await failJob(job, "RESTORE_FAILED", "Restoration did not work for that photo. Your original is unchanged — please try again.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Restoration did not work for that photo. Your original is unchanged — please try again." }));
  }
  let gray = true;
  try {
    gray = (await analyzeImageLocal(input)).isGrayscale;
  } catch {
    gray = true;
  }
  try {
    if (gray) {
      const started = await startColorizeForJob(job, plan, input);
      const updated = await prisma.photoJob.update({
        where: { id: job.id },
        data: { stage: "colorizing", predictionId: started.predictionId, provider: started.provider, model: started.model, deliveredAs: notice },
      });
      return NextResponse.json(publicState(updated));
    }
    const started = await routeUpscaleStart({ image: input, kind: "jpeg", scale: job.scale as 2 | 4, faceEnhance: job.faceEnhance });
    const updated = await prisma.photoJob.update({
      where: { id: job.id },
      data: { status: "UPSCALING", stage: "upscaling", upscalePredId: started.predictionId, deliveredAs: "Face and scratch restoration could not be applied to this photo, so it was upscaled instead." },
    });
    return NextResponse.json(publicState(updated));
  } catch (err) {
    console.error("photo/jobs: fallback after restore failure failed", err);
    await failJob(job, "COLORIZE_FAILED", "Colorize did not work for that photo. Your original is unchanged — please try again later, or use Enhance only.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Colorize did not work for that photo. Your original is unchanged — please try again later, or use Enhance only." }));
  }
}

async function advanceColorizing(job: JobRow, plan: "FREE" | "PREMIUM") {
  if (!job.predictionId) {
    await failJob(job, "NO_PREDICTION", "That job lost its reference. Please run it again.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "That job lost its reference. Please run it again." }));
  }
  // Tier B: the owner's Hugging Face Space, polled by event id.
  // (job.provider is server-side only; it never leaves this route.)
  if (job.provider === "huggingface") {
    let polled;
    try {
      polled = await pollSpaceColorize(job.predictionId);
    } catch (err) {
      if (err instanceof SpaceError) {
        await failJob(job, "SPACE_NOT_CONFIGURED", "Colorize is unavailable right now. Please try again later, or use Enhance only.");
        return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Colorize is unavailable right now. Please try again later, or use Enhance only." }));
      }
      // Transient poll error: return current state, client retries.
      return NextResponse.json(publicState(job));
    }
    if (polled.status === "processing") {
      return NextResponse.json(publicState(job));
    }
    if (polled.status === "failed") {
      await failJob(job, "COLORIZE_FAILED", "Colorize did not work for that photo. Your original is unchanged — please try again later, or use Enhance only.");
      return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Colorize did not work for that photo. Your original is unchanged — please try again later, or use Enhance only." }));
    }
    return await afterColorizeSuccess(job, polled.image, plan, {
      provider: "huggingface",
      model: job.model ?? "hf-space",
      extraCost: 0,
    });
  }
  // Tier C: image-pool colorize.
  const provider = getImageProvider();
  if (!provider) {
    await failJob(job, "AI_NOT_CONFIGURED", "Colorize is unavailable right now. Please try again later, or use Enhance only.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Colorize is unavailable right now. Please try again later, or use Enhance only." }));
  }
  let pred;
  try {
    pred = await provider.getPrediction(job.predictionId);
  } catch (err) {
    console.error("photo/jobs: colorize poll error", err);
    return NextResponse.json(publicState(job));
  }
  if (pred.status === "starting" || pred.status === "processing") {
    return NextResponse.json(publicState(job));
  }
  if (pred.status !== "succeeded") {
    await failJob(job, "COLORIZE_FAILED", "Colorize did not work for that photo. Your original is unchanged — please try again later, or use Enhance only.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Colorize did not work for that photo. Your original is unchanged — please try again later, or use Enhance only." }));
  }
  const url = provider.outputUrl(pred);
  if (!url) {
    await failJob(job, "COLORIZE_OUTPUT_MISSING", "Colorize finished but its result could not be read. Please run it again.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Colorize finished but its result could not be read. Please run it again." }));
  }
  let modelOut: Buffer;
  try {
    modelOut = await provider.fetchOutput(url);
  } catch (err) {
    console.error("photo/jobs: colorize output fetch failed", err);
    return NextResponse.json(publicState(job));
  }
  const colorizeCost = provider.costEstimate(pred);
  return await afterColorizeSuccess(job, modelOut, plan, {
    provider: "replicate",
    model: job.model ?? "",
    extraCost: colorizeCost,
  });
}

/**
 * Shared post-colorize step for every tier: LAB-merge (input L +
 * model a/b), then start the upscale step (every colorize/restore job
 * upscales). The merged image is stored (preUpscaleData) so the Sharp
 * upscale fallback never has to re-fetch the colorize output. If the
 * upscale step cannot even start because it is unconfigured, the
 * colorized image is finalized at its current size instead of hanging
 * the job — the upscale is a bonus, the colorize is the result.
 */
async function afterColorizeSuccess(
  job: JobRow,
  modelOut: Buffer,
  plan: "FREE" | "PREMIUM",
  opts: { provider: string; model: string; extraCost: number }
) {
  if (!job.inputData) {
    await failJob(job, "COLORIZE_OUTPUT_MISSING", "Colorize finished but its result could not be read. Please run it again.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Colorize finished but its result could not be read. Please run it again." }));
  }
  const original = Buffer.from(job.inputData, "base64");
  const merged = await mergeColorized(original, modelOut, {
    style: job.style as "natural" | "vivid" | "warm" | "cool",
    era: job.era as "" | "1900s-1940s" | "1950s-1970s" | "1980s+",
    intensityPct: job.intensity,
  });
  let started;
  try {
    started = await routeUpscaleStart({
      image: merged.buffer,
      kind: "jpeg",
      scale: job.scale as 2 | 4,
      faceEnhance: job.faceEnhance,
    });
  } catch (err) {
    const e = err as AiError;
    if (e?.code === "AI_NOT_CONFIGURED") {
      // Upscale unavailable: deliver the colorized image as-is.
      return await finalize(job, merged.buffer, {
        plan,
        engine: "ai-colorize",
        provider: opts.provider,
        model: opts.model,
        capability: "image-colorize",
        extraCost: opts.extraCost,
      });
    }
    // Any other start failure is transient: let the client retry.
    console.error("photo/jobs: upscale start failed (transient)", err);
    return NextResponse.json(publicState(job));
  }
  if (!prisma) return NextResponse.json(publicState(job));
  const updated = await prisma.photoJob.update({
    where: { id: job.id },
    data: {
      status: "UPSCALING",
      stage: "upscaling",
      upscalePredId: started.predictionId,
      colorized: true,
      preUpscaleData: merged.buffer.toString("base64"),
      costEstimate: (job.costEstimate ?? 0) + opts.extraCost,
    },
  });
  return NextResponse.json(publicState(updated));
}

async function advanceUpscaling(job: JobRow, plan: "FREE" | "PREMIUM") {
  if (!job.upscalePredId) {
    await failJob(job, "NO_PREDICTION", "That job lost its reference. Please run it again.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "That job lost its reference. Please run it again." }));
  }
  const provider = getImageProvider();
  if (!provider) {
    await failJob(job, "AI_NOT_CONFIGURED", "Colorize is unavailable right now. Please try again later, or use Enhance only.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Colorize is unavailable right now. Please try again later, or use Enhance only." }));
  }
  let pred;
  try {
    pred = await provider.getPrediction(job.upscalePredId);
  } catch (err) {
    console.error("photo/jobs: upscale poll error", err);
    return NextResponse.json(publicState(job));
  }
  if (pred.status === "starting" || pred.status === "processing") {
    return NextResponse.json(publicState(job));
  }
  if (pred.status === "succeeded") {
    const url = provider.outputUrl(pred);
    if (url) {
      let out: Buffer;
      try {
        out = await provider.fetchOutput(url);
      } catch (err) {
        console.error("photo/jobs: upscale output fetch failed", err);
        return NextResponse.json(publicState(job));
      }
      const upscaleCost = provider.costEstimate(pred);
      const colorized = job.colorized;
      return await finalize(job, out, {
        plan,
        engine: colorized ? "ai-colorize+ai-hd" : "ai-hd",
        provider: "replicate",
        model: job.model ?? "",
        capability: colorized ? "image-colorize" : "image-upscale",
        extraCost: upscaleCost,
      });
    }
  }
  // Upscale failed: Sharp fallback on the pre-upscale image. For a
  // colorized job that means re-fetching the colorize output and
  // re-merging (deterministic); for restore-on-colour it is the
  // original upload. The HD step is labelled Standard, never AI.
  try {
    const fallbackInput = await buildFallbackInput(job);
    const sharpOut = await sharpEnhance(fallbackInput);
    const colorized = job.colorized;
    return await finalize(job, sharpOut, {
      plan,
      engine: colorized ? "ai-colorize+standard-upscale" : "standard-upscale",
      provider: "sharp",
      model: "sharp-lanczos3",
      capability: colorized ? "image-colorize" : "image-upscale",
      extraCost: 0,
      note: "The AI upscale step failed, so the upscale was done at standard quality instead. The colorize step (if any) still used AI.",
    });
  } catch (err) {
    console.error("photo/jobs: upscale fallback failed", err);
    await failJob(job, "UPSCALE_FAILED", "Upscaling failed for that photo. Your original is unchanged — please try again.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Upscaling failed for that photo. Your original is unchanged — please try again." }));
  }
}

/** Rebuild the pre-upscale image for the Sharp fallback path. */
async function buildFallbackInput(job: JobRow): Promise<Buffer> {
  if (job.preUpscaleData) return Buffer.from(job.preUpscaleData, "base64");
  if (!job.inputData) throw new Error("no input");
  const original = Buffer.from(job.inputData, "base64");
  if (!job.colorized && job.mode !== "restore") return original;
  if (!job.predictionId) throw new Error("no colorize prediction");
  // Pre-preUpscaleData jobs (created before the field existed): the
  // Space tier re-polls its event; the image-pool tier re-fetches.
  if (job.provider === "huggingface") {
    const polled = await pollSpaceColorize(job.predictionId);
    if (polled.status !== "succeeded") throw new Error("no colorize output");
    const merged = await mergeColorized(original, polled.image, {
      style: job.style as "natural" | "vivid" | "warm" | "cool",
      era: job.era as "" | "1900s-1940s" | "1950s-1970s" | "1980s+",
      intensityPct: job.intensity,
    });
    return merged.buffer;
  }
  const provider = getImageProvider();
  if (!provider) throw new Error("no image provider");
  const pred = await provider.getPrediction(job.predictionId);
  const url = provider.outputUrl(pred);
  if (!url) throw new Error("no colorize output");
  const modelOut = await provider.fetchOutput(url);
  const merged = await mergeColorized(original, modelOut, {
    style: job.style as "natural" | "vivid" | "warm" | "cool",
    era: job.era as "" | "1900s-1940s" | "1950s-1970s" | "1980s+",
    intensityPct: job.intensity,
  });
  return merged.buffer;
}

async function finalize(
  job: JobRow,
  finalBuffer: Buffer,
  opts: {
    plan: "FREE" | "PREMIUM";
    engine: string;
    provider: string;
    model: string;
    capability: "image-colorize" | "image-upscale";
    extraCost: number;
    note?: string;
  }
) {
  const encoded = await encodeResult(finalBuffer, {
    format: job.outputFormat as "png" | "jpg" | "webp",
    quality: job.outputQuality,
    maxEdge: edgeCapForPlan(opts.plan),
  });
  const totalCost = (job.costEstimate ?? 0) + opts.extraCost;
  if (!prisma) return NextResponse.json(publicState(job));
  // deliveredAs preservation: a restore-skipped/restore-failed notice
  // set at creation or fallback time survives finalization, unless
  // the encoder itself had a format note (which takes precedence).
  const deliveredAs = encoded.deliveredAs ?? job.deliveredAs ?? null;
  const updated = await prisma.photoJob.update({
    where: { id: job.id },
    data: {
      status: "SUCCEEDED",
      stage: "done",
      resultData: encoded.buffer.toString("base64"),
      resultMime: encoded.mime,
      resultWidth: encoded.width,
      resultHeight: encoded.height,
      engine: opts.engine,
      provider: opts.provider,
      model: opts.model,
      deliveredAs,
      costEstimate: totalCost,
      inputData: null,
    },
  });
  await logAiUsage({
    provider: opts.provider as AiProviderId,
    model: opts.model,
    capability: opts.capability,
    latencyMs: Date.now() - job.createdAt.getTime(),
    success: true,
    costUsd: totalCost,
    credits: job.credits,
    userId: job.userId,
  });
  await logJob({
    userId: job.userId,
    tool: job.mode === "restore" ? "restore" : "colorize",
    status: "SUCCESS",
    inputSummary: job.mode,
    costEstimate: totalCost,
  });
  return NextResponse.json(
    publicState(updated, {
      resultData: updated.resultData,
      resultMime: updated.resultMime,
      resultWidth: updated.resultWidth,
      resultHeight: updated.resultHeight,
      deliveredAs: updated.deliveredAs,
      message: `Done. Output ${updated.resultWidth} x ${updated.resultHeight}px.`,
      note: opts.note,
    })
  );
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionSafe();
  const sessionUserId = (session?.user as unknown as { id?: string } | undefined)?.id ?? null;
  if (!prisma) return NextResponse.json({ error: "Colorize is unavailable right now. Please try Enhance only for now." }, { status: 503 });
  const job = await loadJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (job.userId && job.userId !== sessionUserId) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  try {
    await prisma.photoJob.update({
      where: { id: job.id },
      data: { status: "CANCELED", stage: "canceled", inputData: null, resultData: null },
    });
  } catch {
    return NextResponse.json({ error: "Could not cancel that job." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
