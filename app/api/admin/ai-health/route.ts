// Admin AI health: per-provider, per-day success/latency/spend from
// AiUsageLog, plus today's spend vs the daily cap and each provider's
// key presence (boolean only — never a key value) and admin toggle.
// Admin + TOTP gate via requireAdmin; empty state when the usage table
// does not exist yet (schema not pushed) or no jobs have run.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getAiHealth, getAiSpendCapUsd, getAiSpendToday } from "@/lib/ai/usage";
import { getSettings } from "@/lib/settings";
import { PROVIDERS, providerEnabled, providerKeyPresent } from "@/lib/ai/registry";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { error } = await requireAdmin(req, ["SUPER", "SUPPORT", "FINANCE"]);
  if (error) return error;
  const settings = await getSettings();
  const [rows, spendToday, cap] = await Promise.all([
    getAiHealth(7),
    getAiSpendToday(),
    getAiSpendCapUsd(),
  ]);
  const providers = PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    keyPresent: providerKeyPresent(p.id),
    toggleOn: settings[`ai.provider.${p.id}`] !== "false",
    enabled: providerEnabled(p.id, settings),
    capabilities: p.capabilities,
    note: p.id === "huggingface" ? "Disabled: stored token returns 401; needs a replacement token + HF_ENABLED=true." : undefined,
  }));
  return NextResponse.json({
    days: 7,
    rows,
    spendToday,
    cap,
    budgetAlert: spendToday >= cap * 0.8,
    providers,
    empty: rows.length === 0,
  });
}
