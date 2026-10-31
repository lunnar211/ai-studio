import { prisma } from "./prisma";

// SiteSetting key/value store. Defaults keep guest behaviour identical to
// before auth existed (10/day per AI tool). All reads tolerate a missing DB.
export const SETTING_DEFAULTS: Record<string, string> = {
  logoDailyFree: "10",
  logoDailyPremium: "100",
  enhanceDailyFree: "10",
  enhanceDailyPremium: "100",
  groqCostPerJobUsd: "0.001",
  replicateCostPerJobUsd: "0.01",
  apiBudgetUsd: "50",
  maintenanceMode: "false",
  announcement: "",
  adsEnabled: "false",
  logoEnabled: "true",
  enhanceEnabled: "true",
};

export async function getSettings(): Promise<Record<string, string>> {
  const out = { ...SETTING_DEFAULTS };
  if (!prisma) return out;
  try {
    const rows = await prisma.siteSetting.findMany();
    for (const r of rows) out[r.key] = r.value;
  } catch {
    // Fall through to defaults; tools must keep working.
  }
  return out;
}

export async function getSetting(key: string): Promise<string> {
  return (await getSettings())[key] ?? SETTING_DEFAULTS[key] ?? "";
}

export async function dailyQuota(tool: "logo" | "enhance", plan: "FREE" | "PREMIUM"): Promise<number> {
  const s = await getSettings();
  const key = tool === "logo"
    ? plan === "PREMIUM" ? "logoDailyPremium" : "logoDailyFree"
    : plan === "PREMIUM" ? "enhanceDailyPremium" : "enhanceDailyFree";
  const n = parseInt(s[key] ?? "10", 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

export async function countJobsToday(userId: string, tool: string): Promise<number> {
  if (!prisma) return 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  try {
    return await prisma.job.count({ where: { userId, tool, createdAt: { gte: start } } });
  } catch {
    return 0;
  }
}

export async function logJob(opts: {
  userId?: string | null;
  tool: string;
  status: "SUCCESS" | "FAILED";
  inputSummary?: string;
  errorCode?: string;
  costEstimate?: number;
}): Promise<void> {
  if (!prisma) return;
  try {
    await prisma.job.create({ data: { ...opts, userId: opts.userId ?? null } });
  } catch {
    // Job logging must never break a tool response.
  }
}

export async function audit(opts: {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  ipHash?: string;
}): Promise<void> {
  if (!prisma) return;
  try {
    await prisma.auditLog.create({ data: { ...opts, actorId: opts.actorId ?? null } });
  } catch {
    // Audit failure must not break the admin action itself.
  }
}

export async function logError(source: string, message: string, path?: string): Promise<void> {
  if (!prisma) return;
  try {
    await prisma.errorLog.create({ data: { source, message: message.slice(0, 500), path } });
  } catch {
    // ignore
  }
}

export async function isIpBlocked(ip: string): Promise<boolean> {
  if (!prisma) return false;
  try {
    const { hashIp } = await import("./ip-hash");
    const row = await prisma.blockedIp.findUnique({ where: { ipHash: hashIp(ip) } });
    if (!row) return false;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

export function startOfDay(d = new Date()): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

export function startOfWeek(d = new Date()): Date {
  const s = startOfDay(d);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

export function startOfMonth(d = new Date()): Date {
  const s = startOfDay(d);
  s.setDate(1);
  return s;
}
