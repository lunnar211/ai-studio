"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/field";

export function SetupForm() {
  const [status, setStatus] = useState<{ enabled?: boolean; hasSecret?: boolean } | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/admin/setup-2fa").then((r) => r.json()).then(setStatus).catch(() => setError("Could not load status."));
  }, []);
  async function generate() {
    setError("");
    const res = await fetch("/api/admin/setup-2fa", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || "Setup failed."); return; }
    if (data.enabled) { setStatus({ enabled: true }); return; }
    setSetup({ secret: data.secret, qr: data.qr });
  }
  return (
    <div className="space-y-4">
      {error && <Alert kind="error">{error}</Alert>}
      {status?.enabled ? (
        <Alert kind="info">Two-factor authentication is already enabled on your admin account.</Alert>
      ) : (
        <>
          <p className="text-muted-fg dark:text-slate-300">
            Scan the QR code with an authenticator app (Google Authenticator, Authy, 1Password…),
            then verify a code on the next page. Your secret is stored encrypted (AES-256-GCM);
            it is shown once here so you can save it in your authenticator.
          </p>
          <Button type="button" onClick={generate}>Generate QR code</Button>
          {setup && (
            <div className="border-2 border-line bg-white p-4 dark:bg-slate-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="TOTP QR code for your authenticator app" width={220} height={220} />
              <p className="mt-2 break-all font-mono text-sm">Manual secret: {setup.secret}</p>
              <Link href="/admin/verify-2fa" className="mt-3 inline-flex min-h-[44px] items-center border-2 border-brand-dark bg-brand-dark px-4 font-semibold text-white">
                Verify a code →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
