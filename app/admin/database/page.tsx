import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// /admin/database — READ-ONLY overview of the shared LeadForge database.
// There is deliberately no SQL console, no edit, no delete, and no bulk
// action on this page: it only counts rows and shows the 5 latest rows
// per table. Sensitive columns are NEVER selected, so they cannot leak
// into the HTML: no TOTP secrets, no legacy Auth.js tokens (those three
// tables show counts only), no base64 photo data, no logo SVG blobs,
// and no Paddle customer/subscription ids. Provider names appear here
// because this is the owner's own admin panel — the P0 rule bans them
// from user-facing responses and result UI, not from admin pages.
type TableView = {
  label: string;
  count: number | null;
  columns: string[];
  rows: Array<Record<string, string>>;
  note?: string;
};

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (v instanceof Date) return v.toISOString().slice(0, 16).replace("T", " ");
  if (typeof v === "boolean") return v ? "yes" : "no";
  const s = String(v);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

function view(
  label: string,
  count: number,
  columns: string[],
  rows: Array<Record<string, unknown>>
): TableView {
  return {
    label,
    count,
    columns,
    rows: rows.map((r) => Object.fromEntries(columns.map((c) => [c, fmt(r[c])]))),
  };
}

async function safe<T>(run: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback();
  }
}

export default async function AdminDatabase() {
  await requireAdminPage(["SUPER", "SUPPORT", "FINANCE"]);
  if (!prisma) return <p>Database not configured.</p>;
  // Capture the narrowed client: TS does not keep the !prisma narrowing
  // inside the fetcher closures below, so bind it to a const first.
  const db = prisma;

  const byId = { orderBy: { createdAt: "desc" }, take: 5 } as const;
  const tables: TableView[] = await Promise.all([
    safe(async () => {
      const [count, rows] = await Promise.all([
        db.user.count(),
        db.user.findMany({ ...byId, select: { id: true, email: true, name: true, role: true, adminRole: true, plan: true, status: true, createdAt: true } }),
      ]);
      return view("User", count, ["id", "email", "name", "role", "adminRole", "plan", "status", "createdAt"], rows);
    }, () => ({ label: "User", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe(async () => {
      const [count, rows] = await Promise.all([
        db.logoGeneration.count(),
        db.logoGeneration.findMany({ ...byId, select: { id: true, userId: true, prompt: true, style: true, favorite: true, createdAt: true } }),
      ]);
      return view("LogoGeneration", count, ["id", "userId", "prompt", "style", "favorite", "createdAt"], rows);
    }, () => ({ label: "LogoGeneration", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe(async () => {
      const [count, rows] = await Promise.all([
        db.photoJob.count(),
        db.photoJob.findMany({ ...byId, select: { id: true, userId: true, mode: true, status: true, createdAt: true } }),
      ]);
      return view("PhotoJob", count, ["id", "userId", "mode", "status", "createdAt"], rows);
    }, () => ({ label: "PhotoJob", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe(async () => {
      const [count, rows] = await Promise.all([
        db.job.count(),
        db.job.findMany({ ...byId, select: { id: true, userId: true, tool: true, status: true, errorCode: true, createdAt: true } }),
      ]);
      return view("Job", count, ["id", "userId", "tool", "status", "errorCode", "createdAt"], rows);
    }, () => ({ label: "Job", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe(async () => {
      const [count, rows] = await Promise.all([
        db.aiUsageLog.count(),
        db.aiUsageLog.findMany({ ...byId, select: { id: true, provider: true, model: true, capability: true, success: true, costUsd: true, createdAt: true } }),
      ]);
      return view("AiUsageLog", count, ["id", "provider", "model", "capability", "success", "costUsd", "createdAt"], rows);
    }, () => ({ label: "AiUsageLog", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe(async () => {
      const [count, rows] = await Promise.all([
        db.subscription.count(),
        db.subscription.findMany({ ...byId, select: { id: true, userId: true, provider: true, plan: true, status: true, createdAt: true } }),
      ]);
      return view("Subscription", count, ["id", "userId", "provider", "plan", "status", "createdAt"], rows);
    }, () => ({ label: "Subscription", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe(async () => {
      const [count, rows] = await Promise.all([
        db.payment.count(),
        db.payment.findMany({ ...byId, select: { id: true, userId: true, amount: true, currency: true, status: true, createdAt: true } }),
      ]);
      return view("Payment", count, ["id", "userId", "amount", "currency", "status", "createdAt"], rows);
    }, () => ({ label: "Payment", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe(async () => {
      const [count, rows] = await Promise.all([
        db.auditLog.count(),
        db.auditLog.findMany({ ...byId, select: { id: true, actorId: true, action: true, targetType: true, targetId: true, createdAt: true } }),
      ]);
      return view("AuditLog", count, ["id", "actorId", "action", "targetType", "targetId", "createdAt"], rows);
    }, () => ({ label: "AuditLog", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe(async () => {
      const [count, rows] = await Promise.all([
        db.adminNote.count(),
        db.adminNote.findMany({ ...byId, select: { id: true, userId: true, authorId: true, note: true, createdAt: true } }),
      ]);
      return view("AdminNote", count, ["id", "userId", "authorId", "note", "createdAt"], rows);
    }, () => ({ label: "AdminNote", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe(async () => {
      const [count, rows] = await Promise.all([
        db.supportMessage.count(),
        db.supportMessage.findMany({ ...byId, select: { id: true, email: true, subject: true, status: true, createdAt: true } }),
      ]);
      return view("SupportMessage", count, ["id", "email", "subject", "status", "createdAt"], rows);
    }, () => ({ label: "SupportMessage", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe(async () => {
      const [count, rows] = await Promise.all([
        db.expense.count(),
        db.expense.findMany({ ...byId, select: { id: true, category: true, vendor: true, amount: true, currency: true, createdAt: true } }),
      ]);
      return view("Expense", count, ["id", "category", "vendor", "amount", "currency", "createdAt"], rows);
    }, () => ({ label: "Expense", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe(async () => {
      const [count, rows] = await Promise.all([
        db.blockedIp.count(),
        db.blockedIp.findMany({ ...byId, select: { id: true, ipHash: true, reason: true, expiresAt: true, createdAt: true } }),
      ]);
      return view("BlockedIp", count, ["id", "ipHash", "reason", "expiresAt", "createdAt"], rows);
    }, () => ({ label: "BlockedIp", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe(async () => {
      const [count, rows] = await Promise.all([
        db.siteSetting.count(),
        db.siteSetting.findMany({ take: 50, select: { key: true, value: true } }),
      ]);
      return view("SiteSetting", count, ["key", "value"], rows);
    }, () => ({ label: "SiteSetting", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe(async () => {
      const [count, rows] = await Promise.all([
        db.webhookEvent.count(),
        db.webhookEvent.findMany({ ...byId, select: { id: true, provider: true, eventType: true, createdAt: true } }),
      ]);
      return view("WebhookEvent", count, ["id", "provider", "eventType", "createdAt"], rows);
    }, () => ({ label: "WebhookEvent", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe(async () => {
      const [count, rows] = await Promise.all([
        db.errorLog.count(),
        db.errorLog.findMany({ ...byId, select: { id: true, source: true, message: true, path: true, createdAt: true } }),
      ]);
      return view("ErrorLog", count, ["id", "source", "message", "path", "createdAt"], rows);
    }, () => ({ label: "ErrorLog", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    // Legacy Auth.js tables: retained for shared-schema parity, unused
    // under Supabase Auth. Counts only — their rows may hold tokens.
    safe<TableView>(async () => ({ label: "Account (legacy)", count: await db.account.count(), columns: [], rows: [], note: "Legacy table, unused under Supabase Auth — rows never displayed." }), () => ({ label: "Account (legacy)", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe<TableView>(async () => ({ label: "Session (legacy)", count: await db.session.count(), columns: [], rows: [], note: "Legacy table, unused under Supabase Auth — rows never displayed." }), () => ({ label: "Session (legacy)", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
    safe<TableView>(async () => ({ label: "VerificationToken (legacy)", count: await db.verificationToken.count(), columns: [], rows: [], note: "Legacy table, unused under Supabase Auth — rows never displayed." }), () => ({ label: "VerificationToken (legacy)", count: null, columns: [], rows: [], note: "Table not created yet (schema push pending)." })),
  ]);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Database overview (read-only)</h2>
      <p className="text-muted-fg dark:text-slate-300">
        Live row counts and the 5 latest rows per table from the shared LeadForge database.
        Nothing here edits or deletes: there is no SQL console and no bulk action.
        Sensitive columns (two-factor secrets, legacy tokens, photo data, logo files,
        payment provider ids) are never selected, so they cannot appear on this page.
      </p>
      {tables.map((t) => (
        <section key={t.label} aria-label={`${t.label} table`} className="border-2 border-line bg-white p-4 dark:bg-slate-900">
          <h3 className="text-xl font-bold">
            {t.label} {t.count === null ? "" : `· ${t.count} rows`}
          </h3>
          {t.note && <p className="mt-2 text-muted-fg dark:text-slate-300">{t.note}</p>}
          {!t.note && t.rows.length === 0 && <p className="mt-2 text-muted-fg dark:text-slate-300">No rows yet.</p>}
          {t.rows.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] border-2 border-line text-left">
                <thead>
                  <tr className="border-b-2 border-line">
                    {t.columns.map((c) => (
                      <th key={c} className="p-2">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r, i) => (
                    <tr key={i} className="border-b border-line">
                      {t.columns.map((c) => (
                        <td key={c} className="break-all p-2">{r[c]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
