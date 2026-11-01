"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Label, TextInput, TextArea } from "@/components/ui/field";

function usePost(path: string) {
  const router = useRouter();
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  async function post(body: unknown, method = "POST") {
    setBusy(true);
    setState("");
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setState(data.error || "Request failed.");
      return false;
    }
    setState("Saved.");
    router.refresh();
    return true;
  }
  return { post, state, busy };
}

export function UserActions({ userId, status, plan }: { userId: string; status: string; plan: string }) {
  const { post, state, busy } = usePost(`/api/admin/users/${userId}`);
  const [newPlan, setNewPlan] = useState(plan);
  return (
    <div className="space-y-3 border-2 border-line bg-white p-4 dark:bg-slate-900">
      <h3 className="font-bold">Admin actions (SUPER only)</h3>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => post({ status: status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED" }, "PATCH")}>
          {status === "SUSPENDED" ? "Unsuspend" : "Suspend"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => post({ resetLimits: true }, "PATCH")}>
          Reset today&apos;s limits
        </Button>
        <Button
          type="button" variant="danger" disabled={busy}
          onClick={async () => { if (confirm("Delete this user and all their data? This cannot be undone.")) await post({}, "DELETE"); }}
        >
          Delete user
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="plan-change">Plan</Label>
          <select id="plan-change" value={newPlan} onChange={(e) => setNewPlan(e.target.value)} className="min-h-[44px] border-2 border-line bg-white px-2 dark:bg-slate-900">
            <option value="FREE">FREE</option>
            <option value="PREMIUM">PREMIUM</option>
          </select>
        </div>
        <Button type="button" variant="outline" disabled={busy} onClick={() => post({ plan: newPlan }, "PATCH")}>Change plan</Button>
      </div>
      {state && <p role="status" className="text-sm">{state}</p>}
    </div>
  );
}

export function NoteForm({ userId }: { userId: string }) {
  const { post, state, busy } = usePost(`/api/admin/users/${userId}/notes`);
  const [note, setNote] = useState("");
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); if (await post({ note })) setNote(""); }}
      className="space-y-3 border-2 border-line bg-white p-4 dark:bg-slate-900"
    >
      <Label htmlFor="admin-note">Internal note (never shown to the user)</Label>
      <TextArea id="admin-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} required />
      <Button type="submit" disabled={busy}>Add note</Button>
      {state && <p role="status" className="text-sm">{state}</p>}
    </form>
  );
}

export function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const { post, state, busy } = usePost("/api/admin/settings");
  const [values, setValues] = useState(initial);
  const fields: Array<[string, string]> = [
    ["logoDailyFree", "Logo daily limit (free)"], ["logoDailyPremium", "Logo daily limit (premium)"],
    // enhanceDailyFree no longer gates anything: free photos are
    // unlimited. enhanceDailyPremium is the Premium paid-GPU budget.
    ["enhanceDailyPremium", "Premium paid-GPU photo budget per day"],
    ["groqCostPerJobUsd", "Groq cost estimate per logo job (USD)"], ["replicateCostPerJobUsd", "Replicate cost estimate per enhance job (USD)"],
    ["apiBudgetUsd", "AI budget alert threshold, trailing 30 days (USD)"],
    ["announcement", "Announcement banner (empty = hidden)"],
  ];
  const toggles: Array<[string, string]> = [
    ["maintenanceMode", "Maintenance mode"], ["logoEnabled", "Logo generator on"],
    ["enhanceEnabled", "Photo enhancer on"], ["adsEnabled", "Ads enabled (only after AdSense approval)"],
    ["ai.provider.groq", "AI provider: Groq on"], ["ai.provider.gemini", "AI provider: Gemini on"],
    ["ai.provider.openrouter", "AI provider: OpenRouter on"], ["ai.provider.nvidia", "AI provider: NVIDIA on"],
    ["ai.provider.elevenlabs", "AI provider: ElevenLabs on"], ["ai.provider.replicate", "AI provider: Replicate on"],
    ["ai.provider.huggingface", "AI provider: HuggingFace on (also needs a valid token + HF_ENABLED=true)"],
    ["ai.provider.sharp", "Local Sharp pipeline on"],
  ];
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); post({ settings: values }); }}
      className="space-y-4 border-2 border-line bg-white p-4 dark:bg-slate-900"
    >
      {fields.map(([key, label]) => (
        <div key={key}>
          <Label htmlFor={`s-${key}`}>{label}</Label>
          <TextInput id={`s-${key}`} value={values[key] ?? ""} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
        </div>
      ))}
      {toggles.map(([key, label]) => (
        <label key={key} className="flex min-h-[44px] items-center gap-2">
          <input type="checkbox" checked={values[key] === "true"} onChange={(e) => setValues({ ...values, [key]: e.target.checked ? "true" : "false" })} className="h-5 w-5" />
          <span>{label}</span>
        </label>
      ))}
      <Button type="submit" disabled={busy}>Save settings</Button>
      {state && <p role="status" className="text-sm">{state}</p>}
      <p className="text-sm text-muted-fg dark:text-slate-400">
        Plan prices live in the Paddle dashboard (PADDLE_PRICE_ID in env), not here — changing a
        price in Paddle does not change this form, and vice versa.
      </p>
    </form>
  );
}

export function ExpenseForm() {
  const { post, state, busy } = usePost("/api/admin/expenses");
  const [form, setForm] = useState({ category: "hosting", vendor: "", amount: "", currency: "USD", date: "", note: "" });
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); await post({ ...form, amount: parseInt(form.amount, 10) || 0 }); }}
      className="space-y-3 border-2 border-line bg-white p-4 dark:bg-slate-900"
    >
      <h3 className="font-bold">Add expense (amounts in minor units, e.g. cents)</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="ex-cat">Category</Label><TextInput id="ex-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required /></div>
        <div><Label htmlFor="ex-vendor">Vendor</Label><TextInput id="ex-vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} required /></div>
        <div><Label htmlFor="ex-amount">Amount (minor units)</Label><TextInput id="ex-amount" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
        <div><Label htmlFor="ex-currency">Currency</Label><TextInput id="ex-currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} required /></div>
        <div><Label htmlFor="ex-date">Date</Label><TextInput id="ex-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
        <div><Label htmlFor="ex-note">Note</Label><TextInput id="ex-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
      </div>
      <Button type="submit" disabled={busy}>Add expense</Button>
      {state && <p role="status" className="text-sm">{state}</p>}
    </form>
  );
}

export function BlockForm() {
  const { post, state, busy } = usePost("/api/admin/block");
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); if (await post({ ip, reason })) { setIp(""); setReason(""); } }}
      className="space-y-3 border-2 border-line bg-white p-4 dark:bg-slate-900"
    >
      <h3 className="font-bold">Block an IP (only its hash is stored)</h3>
      <div><Label htmlFor="block-ip">IP address</Label><TextInput id="block-ip" value={ip} onChange={(e) => setIp(e.target.value)} required placeholder="203.0.113.10" /></div>
      <div><Label htmlFor="block-reason">Reason</Label><TextInput id="block-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <Button type="submit" disabled={busy}>Block IP</Button>
      {state && <p role="status" className="text-sm">{state}</p>}
    </form>
  );
}

export function SupportReplyForm({ id }: { id: string }) {
  const { post, state, busy } = usePost(`/api/admin/support/${id}`);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("REPLIED");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); post({ reply, status }); }}
      className="space-y-2"
    >
      <Label htmlFor={`reply-${id}`}>Reply (recorded in DB; send via the mailto link — no SMTP is configured)</Label>
      <TextArea id={`reply-${id}`} value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={5000} />
      <div className="flex flex-wrap gap-2">
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-[44px] border-2 border-line bg-white px-2 dark:bg-slate-900">
          <option value="OPEN">OPEN</option>
          <option value="REPLIED">REPLIED</option>
          <option value="CLOSED">CLOSED</option>
        </select>
        <Button type="submit" disabled={busy}>Save reply</Button>
      </div>
      {state && <p role="status" className="text-sm">{state}</p>}
    </form>
  );
}

export function CleanupButton() {
  const { post, state, busy } = usePost("/api/admin/cleanup");
  return (
    <div className="border-2 border-line bg-white p-4 dark:bg-slate-900">
      <h3 className="font-bold">Job retention cleanup</h3>
      <p className="text-sm text-muted-fg dark:text-slate-400">Deletes Job rows older than 90 days (documented retention policy).</p>
      <Button type="button" variant="outline" disabled={busy} className="mt-2" onClick={() => post({})}>Run cleanup now</Button>
      {state && <p role="status" className="mt-2 text-sm">{state}</p>}
    </div>
  );
}

export function UserSearch({ defaultValue }: { defaultValue: string }) {
  // Admin shortcut: pressing "/" focuses the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        document.getElementById("user-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form method="get" role="search" className="flex gap-2">
      <label htmlFor="user-search" className="sr-only">Search users</label>
      <input
        id="user-search" name="q" defaultValue={defaultValue} placeholder="Search name or email…"
        className="min-h-[44px] flex-1 border-2 border-line bg-white px-3 dark:bg-slate-900"
      />
      <Button type="submit">Search</Button>
    </form>
  );
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="mt-4 min-h-[44px] border-2 border-line bg-white px-4 font-semibold print:hidden dark:bg-slate-900">
      Print / Save as PDF
    </button>
  );
}

export function ErrorBanner({ children }: { children: React.ReactNode }) {
  return <Alert kind="error">{children}</Alert>;
}
