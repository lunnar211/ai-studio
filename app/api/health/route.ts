import { NextResponse } from "next/server";

// Public health check: liveness only. Returns no secrets, no key
// presence, no user data — safe to poll from uptime monitors.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, service: "ai-studio", time: new Date().toISOString() });
}
