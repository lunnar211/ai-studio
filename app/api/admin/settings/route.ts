import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, auditAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { SETTING_DEFAULTS } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { session, error } = await requireAdmin(req, ["SUPER"]);
  if (error) return error;
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const parsed = z.object({ settings: z.record(z.string(), z.string()) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  // Only known keys are writable; unknown keys are ignored, never stored.
  const entries = Object.entries(parsed.data.settings).filter(([k]) => k in SETTING_DEFAULTS);
  try {
    for (const [key, value] of entries) {
      await prisma.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    }
    await auditAdmin(req, session.id, "settings.update", "setting", entries.map(([k]) => k).join(","));
  } catch {
    return NextResponse.json({ error: "Could not save settings." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
