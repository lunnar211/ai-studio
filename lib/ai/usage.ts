// AI usage logging + spend caps. Logging must NEVER break a user
// request: every write is wrapped in try/catch, and a missing table
// (before the owner pushes the schema) degrades to "no data", not an
// error. The admin AI-health page reads the same table.

import { prisma } from "../prisma";
import { getSettings } from "../settings";
import type { AiUsageEntry } from "./types";

/** Best-effort usage log write. Never throws. */
export async function logAiUsage(entry: AiUsageEntry): Promise<void> {
  if (!prisma) return;
  try {
    await prisma.aiUsageLog.create({
      data: {
        provider: entry.provider,
        model: entry.model,
        capability: entry.capability,
        latencyMs: entry.latencyMs,
        success: entry.success,
        costUsd: entry.costUsd,
        credits: entry.credits ?? 0,
        userId: entry.userId ?? null,
      },
    });
  } catch {
    // Missing table (schema not pushed yet) or any DB error: ignore.
  }
}

/** Total estimated AI spend today (USD), optionally for one provider. */
export async function getAiSpendToday(provider?: string): Promise<number> {
  if (!prisma) return 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  try {
    const rows = await prisma.aiUsageLog.findMany({
      where: { createdAt: { gte: start }, ...(provider ? { provider } : {}) },
      select: { costUsd: true },
    });
    return rows.reduce((sum, r) => sum + r.costUsd, 0);
  } catch {
    return 0;
  }
}

/** Daily spend cap from settings (default $10). */
export async function getAiSpendCapUsd(): Promise<number> {
  const cap = parseFloat((await getSettings())["aiDailySpendCapUsd"] ?? "10");
  return Number.isFinite(cap) && cap > 0 ? cap : 10;
}

/**
 * Spend-cap gate for paid providers (Replicate). Returns ok=false when
 * today's spend already reached the cap. Also fires a once-per-day
 * budget alert (ErrorLog row + admin banner data) at 80% of the cap.
 * Email alerts are NOT promised: no SMTP is configured.
 */
export async function checkSpendCap(): Promise<{
  ok: boolean;
  spent: number;
  cap: number;
}> {
  const [spent, cap] = await Promise.all([getAiSpendToday(), getAiSpendCapUsd()]);
  if (spent >= cap) return { ok: false, spent, cap };
  if (spent >= cap * 0.8) {
    try {
      const settings = await getSettings();
      const today = new Date().toISOString().slice(0, 10);
      if (settings["aiBudgetAlertDate"] !== today && prisma) {
        await prisma.errorLog
          .create({
            data: {
              source: "ai-budget-alert",
              message: `AI spend today $${spent.toFixed(2)} reached 80% of the $${cap} daily cap.`,
            },
          })
          .catch(() => null);
        await prisma.siteSetting
          .upsert({
            where: { key: "aiBudgetAlertDate" },
            update: { value: today },
            create: { key: "aiBudgetAlertDate", value: today },
          })
          .catch(() => null);
      }
    } catch {
      // Alerting must never block a request.
    }
  }
  return { ok: true, spent, cap };
}

/** Per-provider, per-day aggregates for /admin/ai-health. */
export async function getAiHealth(days = 7): Promise<
  Array<{
    provider: string;
    day: string;
    calls: number;
    successes: number;
    avgLatencyMs: number;
    spendUsd: number;
  }>
> {
  if (!prisma) return [];
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  try {
    const rows = await prisma.aiUsageLog.findMany({
      where: { createdAt: { gte: start } },
      select: { provider: true, createdAt: true, success: true, latencyMs: true, costUsd: true },
    });
    const map = new Map<string, { calls: number; successes: number; latencySum: number; spend: number }>();
    for (const r of rows) {
      const key = `${r.provider}|${r.createdAt.toISOString().slice(0, 10)}`;
      const agg = map.get(key) ?? { calls: 0, successes: 0, latencySum: 0, spend: 0 };
      agg.calls += 1;
      if (r.success) agg.successes += 1;
      agg.latencySum += r.latencyMs;
      agg.spend += r.costUsd;
      map.set(key, agg);
    }
    return [...map.entries()]
      .map(([key, agg]) => {
        const [provider, day] = key.split("|");
        return {
          provider,
          day,
          calls: agg.calls,
          successes: agg.successes,
          avgLatencyMs: agg.calls ? Math.round(agg.latencySum / agg.calls) : 0,
          spendUsd: Math.round(agg.spend * 10000) / 10000,
        };
      })
      .sort((a, b) => (a.day < b.day ? 1 : -1));
  } catch {
    return [];
  }
}
