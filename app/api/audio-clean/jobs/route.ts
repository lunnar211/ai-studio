import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionSafe } from "@/lib/auth";
import { checkMinuteRateLimit, getClientIp } from "@/lib/rate-limit";
import { logJob } from "@/lib/settings";

/**
 * POST /api/audio-clean/jobs — record one audio-clean job row.
 *
 * The editor processes audio 100% in the browser, so this route
 * receives NO file bytes by construction — only a status row for the
 * per-user /account history (tool / status / date) and the status-only
 * admin oversight. Audio cleaning costs the service nothing, so no
 * GPU budget is checked here; the 5/min per-IP limiter is abuse
 * protection, not a usage cap (same distinction as the free photo
 * routes). Auth runs before validation, so a logged-out caller learns
 * nothing about validation rules from the error shape.
 */

const bodySchema = z.object({
  status: z.enum(["SUCCESS", "FAILED"]),
  inputSummary: z.string().max(200).optional(),
  errorCode: z.string().max(64).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const session = await getSessionSafe();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in to use the audio cleaner." }, { status: 401 });
  }
  if (session.user.status === "SUSPENDED") {
    return NextResponse.json({ error: "Account suspended." }, { status: 403 });
  }
  const ip = getClientIp(req);
  const rl = await checkMinuteRateLimit(ip, "audio-clean", 5);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid job record." }, { status: 400 });
  }
  await logJob({
    userId: session.user.id,
    tool: "audio-clean",
    status: parsed.data.status,
    inputSummary: parsed.data.inputSummary,
    errorCode: parsed.data.errorCode,
    costEstimate: 0,
  });
  return NextResponse.json({ ok: true });
}
