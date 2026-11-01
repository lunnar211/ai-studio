// /admin/ai-health — AI provider health (admin + TOTP gate, same as
// the dashboard). Per-provider, per-day calls, success rate, average
// latency, and estimated spend from AiUsageLog, plus today's spend vs
// the daily cap and each provider's key/toggle state (booleans only).
// Empty state when nothing has been logged yet — either no AI jobs
// have run, or the AiUsageLog table is still waiting on the owner's
// one-time prisma db push (the page says which to check).

import { requireAdminPage } from "@/lib/admin-page";
import { getAiHealth, getAiSpendCapUsd, getAiSpendToday } from "@/lib/ai/usage";
import { getSettings } from "@/lib/settings";
import { PROVIDERS, providerEnabled, providerKeyPresent } from "@/lib/ai/registry";

export const dynamic = "force-dynamic";

export default async function AiHealthPage() {
  await requireAdminPage(["SUPER", "SUPPORT", "FINANCE"]);
  const settings = await getSettings();
  const [rows, spendToday, cap] = await Promise.all([
    getAiHealth(7),
    getAiSpendToday(),
    getAiSpendCapUsd(),
  ]);
  const budgetAlert = spendToday >= cap * 0.8;
  const providers = PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    keyPresent: providerKeyPresent(p.id),
    toggleOn: settings[`ai.provider.${p.id}`] !== "false",
    enabled: providerEnabled(p.id, settings),
    capabilities: p.capabilities.join(", "),
  }));

  return (
    <div className="max-w-4xl space-y-6">
      <h2 className="text-2xl font-bold">AI provider health (last 7 days)</h2>
      <section aria-label="Spend today" className="border-2 border-line bg-white p-4 dark:bg-slate-900">
        <p className="text-sm text-muted-fg dark:text-slate-400">Estimated AI spend today (paid providers)</p>
        <p className="mt-1 text-2xl font-bold">
          ${spendToday.toFixed(4)} / ${cap.toFixed(2)} daily cap
        </p>
        {budgetAlert && (
          <p role="alert" className="mt-2 border-2 border-destructive bg-red-50 p-3 font-semibold dark:bg-red-950">
            Budget alert: spend today is at or above 80% of the daily cap. New paid jobs stop at the cap.
          </p>
        )}
        <p className="mt-2 text-sm text-muted-fg dark:text-slate-400">
          Spend is estimated from each prediction&apos;s reported GPU time (Replicate) or a small
          per-call estimate (Gemini); Groq is free-tier. Estimates are not bills.
        </p>
      </section>

      <section aria-label="Providers" className="border-2 border-line bg-white p-4 dark:bg-slate-900">
        <h3 className="text-xl font-bold">Providers</h3>
        <p className="mt-1 text-sm text-muted-fg dark:text-slate-400">
          Key present means the env key is set on this deployment — never a key value. Toggle off
          instantly in Settings to disable a provider without a redeploy.
        </p>
        <ul className="mt-3 space-y-2">
          {providers.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 border-t border-line pt-2 text-sm">
              <span className="font-bold">{p.label}</span>
              <span>{p.enabled ? "Enabled" : "Disabled"}</span>
              <span>Key: {p.keyPresent ? "set" : "not set"}</span>
              <span>Toggle: {p.toggleOn ? "on" : "off"}</span>
              <span className="text-muted-fg dark:text-slate-400">{p.capabilities}</span>
              {p.id === "huggingface" && (
                <span className="text-muted-fg dark:text-slate-400">
                  Disabled: the stored token returns 401 — needs a replacement token plus HF_ENABLED=true.
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Daily usage" className="border-2 border-line bg-white p-4 dark:bg-slate-900">
        <h3 className="text-xl font-bold">Daily usage by provider</h3>
        {rows.length === 0 ? (
          <p className="mt-2 text-muted-fg dark:text-slate-300">
            No AI usage recorded yet. That means either no AI jobs have run, or the AiUsageLog
            table has not been created yet — the owner runs one <code>prisma db push</code> to
            create it (the same push that creates the logo history table). Usage appears here
            automatically after that.
          </p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className="py-1 pr-2">Provider</th>
                <th scope="col" className="py-1 pr-2">Day</th>
                <th scope="col" className="py-1 pr-2">Calls</th>
                <th scope="col" className="py-1 pr-2">Success</th>
                <th scope="col" className="py-1 pr-2">Avg latency</th>
                <th scope="col" className="py-1 pr-2">Spend (est.)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.provider}-${r.day}`} className="border-t border-line">
                  <td className="py-1 pr-2">{r.provider}</td>
                  <td className="py-1 pr-2">{r.day}</td>
                  <td className="py-1 pr-2">{r.calls}</td>
                  <td className="py-1 pr-2">
                    {r.calls > 0 ? `${Math.round((r.successes / r.calls) * 100)}%` : "—"}
                  </td>
                  <td className="py-1 pr-2">{Math.round(r.avgLatencyMs)} ms</td>
                  <td className="py-1 pr-2">${r.spendUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
