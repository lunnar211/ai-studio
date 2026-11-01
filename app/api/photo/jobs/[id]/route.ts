// Poll + advance an async photo job (Phase 1).
//
// Serverless functions stop at 60s, so the client polls every few
// seconds and THIS endpoint advances the job one step per call:
//   COLORIZING: check the DDColor prediction; on success LAB-merge
//     (original L + model a/b) and either finalize or start upscale.
//   UPSCALING: check the Real-ESRGAN prediction; on success finalize.
//     On failure, fall back to the Sharp pipeline for the upscale step
//     only (labelled honestly — the colorize step is never faked).
// A transient poll error never fails the job; the client simply
// retries. The job id is a random cuid held by the client — that is
// the resume key. Signed-in jobs additionally require the owner.
//
// Privacy: inputData is cleared at every terminal state; resultData
// is cleared after 2 hours (polling then reports it expired).

import { NextResponse } from "next/server";
import { checkAiRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { getSessionSafe } from "@/lib/auth";
import { isIpBlocked, logJob } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { logAiUsage } from "@/lib/ai/usage";
import {
  REPLICATE_COLORIZE_MODEL,
  REPLICATE_UPSCALE_MODEL,
  replicateCostEstimate,
  replicateFetchOutput,
  replicateGet,
  replicateOutputUrl,
  type ReplicatePrediction,
} from "@/lib/ai/adapters/replicate";
import { sharpEnhance } from "@/lib/ai/adapters/sharp-local";
import { edgeCapForPlan, encodeResult, mergeColorized } from "@/lib/ai/colorize";
import { routeUpscaleStart, type AiError } from "@/lib/ai/router";

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

function publicState(job: JobRow, extra: Record<string, unknown> = {}) {
  return {
    jobId: job.id,
    status: job.status,
    stage: job.stage,
    mode: job.mode,
    credits: job.credits,
    engine: job.engine,
    provider: job.provider,
    model: job.model,
    ...extra,
  };
}

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
    return NextResponse.json({ error: "Photo jobs need a database setup that is not finished yet." }, { status: 503 });
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
      return await advanceColorizing(job, sessionPlan);
    }
    if (job.status === "UPSCALING") {
      return await advanceUpscaling(job, sessionPlan);
    }
    return NextResponse.json(publicState(job));
  } catch (err) {
    // Transient poll errors (network blip, Replicate hiccup) must not
    // fail the job: return the current state and let the client retry.
    const e = err as AiError;
    if (e?.code === "AI_NOT_CONFIGURED") {
      await failJob(job, "AI_NOT_CONFIGURED", "Colorize is unavailable right now: the image model is not configured.");
      return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Colorize is unavailable right now: the image model is not configured." }));
    }
    return NextResponse.json(publicState(job));
  }
}

async function advanceColorizing(job: JobRow, plan: "FREE" | "PREMIUM") {
  if (!job.predictionId) {
    await failJob(job, "NO_PREDICTION", "That job lost its image-model reference. Please run it again.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "That job lost its image-model reference. Please run it again." }));
  }
  const pred: ReplicatePrediction = await replicateGet(job.predictionId);
  if (pred.status === "starting" || pred.status === "processing") {
    return NextResponse.json(publicState(job));
  }
  if (pred.status !== "succeeded") {
    await failJob(job, "COLORIZE_FAILED", "Colorize is unavailable right now: the image model could not colorize that photo. Your original is unchanged — please try again later, or use Enhance only.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Colorize is unavailable right now: the image model could not colorize that photo. Your original is unchanged — please try again later, or use Enhance only." }));
  }
  const url = replicateOutputUrl(pred);
  if (!url || !job.inputData) {
    await failJob(job, "COLORIZE_OUTPUT_MISSING", "Colorize finished but its result could not be read. Please run it again.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Colorize finished but its result could not be read. Please run it again." }));
  }
  const modelOut = await replicateFetchOutput(url);
  const colorizeCost = replicateCostEstimate(pred);
  const original = Buffer.from(job.inputData, "base64");
  const merged = await mergeColorized(original, modelOut, {
    style: job.style as "natural" | "vivid" | "warm" | "cool",
    era: job.era as "" | "1900s-1940s" | "1950s-1970s" | "1980s+",
    intensityPct: job.intensity,
  });
  const needsUpscale = job.mode === "colorize-hd" || job.mode === "restore";
  if (!needsUpscale) {
    return await finalize(job, merged.buffer, {
      plan,
      engine: "ai-colorize",
      provider: "replicate",
      model: REPLICATE_COLORIZE_MODEL,
      capability: "image-colorize",
      extraCost: colorizeCost,
    });
  }
  // Start the upscale step with the merged image as its input. The
  // original input is KEPT until a terminal state, so an upscale
  // failure can still re-merge and Sharp-fallback honestly.
  const started = await routeUpscaleStart({
    image: merged.buffer,
    kind: "jpeg",
    scale: job.scale as 2 | 4,
    faceEnhance: job.faceEnhance,
  });
  if (!prisma) return NextResponse.json(publicState(job));
  const updated = await prisma.photoJob.update({
    where: { id: job.id },
    data: {
      status: "UPSCALING",
      stage: "upscaling",
      upscalePredId: started.predictionId,
      colorized: true,
      costEstimate: (job.costEstimate ?? 0) + colorizeCost,
    },
  });
  return NextResponse.json(publicState(updated));
}

async function advanceUpscaling(job: JobRow, plan: "FREE" | "PREMIUM") {
  if (!job.upscalePredId) {
    await failJob(job, "NO_PREDICTION", "That job lost its upscale reference. Please run it again.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "That job lost its upscale reference. Please run it again." }));
  }
  const pred: ReplicatePrediction = await replicateGet(job.upscalePredId);
  if (pred.status === "starting" || pred.status === "processing") {
    return NextResponse.json(publicState(job));
  }
  if (pred.status === "succeeded") {
    const url = replicateOutputUrl(pred);
    if (url) {
      const out = await replicateFetchOutput(url);
      const upscaleCost = replicateCostEstimate(pred);
      const colorized = job.colorized || job.mode === "colorize-hd";
      return await finalize(job, out, {
        plan,
        engine: colorized ? "ai-colorize+ai-hd" : "ai-hd",
        provider: "replicate",
        model: colorized ? REPLICATE_COLORIZE_MODEL : REPLICATE_UPSCALE_MODEL,
        capability: colorized ? "image-colorize" : "image-upscale",
        extraCost: upscaleCost,
      });
    }
  }
  // Upscale failed: Sharp fallback on the pre-upscale image. For a
  // colorized job that means re-fetching the colorize output and
  // re-merging (deterministic); for restore-on-colour it is the
  // original upload. The HD step is labelled standard, never AI.
  try {
    const fallbackInput = await buildFallbackInput(job);
    const sharpOut = await sharpEnhance(fallbackInput);
    const colorized = job.colorized || job.mode === "colorize-hd";
    return await finalize(job, sharpOut, {
      plan,
      engine: colorized ? "ai-colorize+standard-upscale" : "standard-upscale",
      provider: "sharp",
      model: "sharp-lanczos3",
      capability: colorized ? "image-colorize" : "image-upscale",
      extraCost: 0,
      note: "The AI HD upscale step failed, so the upscale was done at standard quality instead. The colorize step (if any) still used AI.",
    });
  } catch {
    await failJob(job, "UPSCALE_FAILED", "Upscaling failed for that photo. Your original is unchanged — please try again.");
    return NextResponse.json(publicState({ ...job, status: "FAILED" }, { error: "Upscaling failed for that photo. Your original is unchanged — please try again." }));
  }
}

/** Rebuild the pre-upscale image for the Sharp fallback path. */
async function buildFallbackInput(job: JobRow): Promise<Buffer> {
  if (!job.inputData) throw new Error("no input");
  const original = Buffer.from(job.inputData, "base64");
  if (!job.colorized && job.mode !== "colorize-hd") return original;
  if (!job.predictionId) throw new Error("no colorize prediction");
  const pred = await replicateGet(job.predictionId);
  const url = replicateOutputUrl(pred);
  if (!url) throw new Error("no colorize output");
  const modelOut = await replicateFetchOutput(url);
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
      deliveredAs: encoded.deliveredAs,
      costEstimate: totalCost,
      inputData: null,
    },
  });
  await logAiUsage({
    provider: opts.provider as "replicate" | "sharp",
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
      note: opts.note,
    })
  );
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionSafe();
  const sessionUserId = (session?.user as unknown as { id?: string } | undefined)?.id ?? null;
  if (!prisma) return NextResponse.json({ error: "Photo jobs need a database setup that is not finished yet." }, { status: 503 });
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
