import { NextResponse } from "next/server";
import { getSessionSafe } from "@/lib/auth";
import { countJobsToday, dailyQuota } from "@/lib/settings";
import { getClientIp, peekAiRateLimit } from "@/lib/rate-limit";

// Powers the "X of 10 left today" counter on the logo page.
// Signed-in: exact counts from the database. Guest: in-memory peek
// (no unit consumed); null when Upstash is in use, where peeking is
// impossible without consuming — the UI then shows the daily limit
// without a live count rather than a wrong number.
export async function GET(req: Request) {
  const session = await getSessionSafe();
  const user = session?.user as { id?: string; plan?: string } | undefined;
  if (user?.id) {
    const plan = user.plan === "PREMIUM" ? "PREMIUM" : "FREE";
    const limit = await dailyQuota("logo", plan);
    const used = await countJobsToday(user.id, "logo");
    return NextResponse.json({
      signedIn: true,
      plan,
      limit,
      used,
      remaining: Math.max(0, limit - used),
    });
  }
  const ip = getClientIp(req);
  const peek = await peekAiRateLimit(ip, "logo");
  return NextResponse.json({
    signedIn: false,
    plan: "GUEST",
    limit: 10,
    used: peek ? 10 - peek.remaining : null,
    remaining: peek?.remaining ?? null,
  });
}
