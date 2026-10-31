"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Label, TextInput } from "@/components/ui/field";

export function VerifyForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/verify-2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error || "Verification failed."); return; }
    router.push("/admin");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-4 border-2 border-line bg-white p-6 dark:bg-slate-900" aria-label="Two-factor verification">
      {error && <Alert kind="error">{error}</Alert>}
      <div>
        <Label htmlFor="totp-code">6-digit code from your authenticator app</Label>
        <TextInput id="totp-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required autoComplete="one-time-code" />
      </div>
      <Button type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify"}</Button>
      <p className="text-sm text-muted-fg dark:text-slate-400">
        Verification is valid for 12 hours. If you have not set up two-factor yet, visit{" "}
        <a className="underline" href="/admin/setup-2fa">setup</a> first.
      </p>
    </form>
  );
}
