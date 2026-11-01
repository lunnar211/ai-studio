"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseSignOut } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/field";

export function ExportButton() {
  const [state, setState] = useState("");
  async function run() {
    setState("Preparing…");
    const res = await fetch("/api/account/export");
    if (!res.ok) {
      setState("Export failed. Please try again.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-studio-my-data.json";
    a.click();
    URL.revokeObjectURL(url);
    setState("Downloaded.");
  }
  return (
    <div>
      <Button type="button" variant="outline" onClick={run}>Export my data (JSON)</Button>
      {state && <p className="mt-2 text-sm text-muted-fg dark:text-slate-400" role="status">{state}</p>}
    </div>
  );
}

export function CheckoutButton({ billing = "monthly", label }: { billing?: "monthly" | "yearly"; label?: string }) {
  const [state, setState] = useState("");
  async function run() {
    setState("Starting checkout…");
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ billing }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setState(data.error || "Checkout is not available right now.");
      return;
    }
    if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    else setState("Checkout is not available right now.");
  }
  return (
    <div>
      <Button type="button" onClick={run}>{label ?? "Upgrade to Premium via Paddle"}</Button>
      {state && <p className="mt-2 text-sm text-muted-fg dark:text-slate-400" role="status">{state}</p>}
      <p className="mt-2 text-sm text-muted-fg dark:text-slate-400">
        Paid plans require age 18+. Checkout is handled by Paddle (merchant of record);
        no card details are ever entered on this site.
      </p>
    </div>
  );
}

export function DeleteButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    setError("");
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (!res.ok) {
      setError("Delete failed. Please try again or contact support.");
      return;
    }
    await supabaseSignOut();
    router.push("/");
    router.refresh();
  }
  if (!confirming) {
    return (
      <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
        Delete my account and data
      </Button>
    );
  }
  return (
    <div>
      <Alert kind="error">
        This permanently deletes your account, jobs, subscriptions, payments, notes and
        audit rows about you. This cannot be undone.
      </Alert>
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="danger" onClick={run}>Yes, delete everything</Button>
        <Button type="button" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
      </div>
      {error && <p className="mt-2 text-sm" role="alert">{error}</p>}
    </div>
  );
}
