"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { completeOnboarding } from "./actions";
import { Button } from "@/components/ui/button";
import { Alert, Label, TextInput } from "@/components/ui/field";

export function OnboardingForm() {
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<"" | "UNDER_13" | "UNDER_16">("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    const res = await completeOnboarding(formData);
    setPending(false);
    if (res.ok) return;
    if (res.blocked) {
      setBlocked(res.blocked);
      if (res.blocked === "UNDER_13") {
        // Account deleted server-side; sign out locally.
        setTimeout(() => signOut({ callbackUrl: "/" }), 3000);
      }
      return;
    }
    setError(res.error || "Something went wrong.");
  }

  if (blocked === "UNDER_13") {
    return (
      <Alert kind="info">
        This account cannot be created: AI Studio is not available to children under 13,
        and no data from this account has been kept. You will be signed out shortly.
      </Alert>
    );
  }
  if (blocked === "UNDER_16") {
    return (
      <Alert kind="info">
        AI Studio accounts cannot be activated under age 16. No age information was saved.
        Please come back when you are 16 or older.
      </Alert>
    );
  }

  return (
    <form action={submit} className="mt-6 border-2 border-line bg-white p-6 dark:bg-slate-900" aria-label="Age confirmation">
      {error && <Alert kind="error">{error}</Alert>}
      <div>
        <Label htmlFor="dob">Date of birth</Label>
        <TextInput id="dob" name="dob" type="date" required />
        <p className="mt-1 text-sm text-muted-fg dark:text-slate-400">
          We only use this to check the age rules below. No ID document is ever requested.
        </p>
      </div>
      <label className="mt-4 flex min-h-[44px] items-start gap-2">
        <input type="checkbox" name="confirm" required className="mt-1 h-5 w-5" />
        <span>I confirm the age I entered is correct.</span>
      </label>
      <label className="mt-2 flex min-h-[44px] items-start gap-2">
        <input type="checkbox" name="terms" required className="mt-1 h-5 w-5" />
        <span>
          I accept the <a className="underline" href="/terms">Terms</a> and{" "}
          <a className="underline" href="/privacy">Privacy Policy</a>.
        </span>
      </label>
      <Button type="submit" disabled={pending} className="mt-5">
        {pending ? "Saving…" : "Continue"}
      </Button>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-fg dark:text-slate-400">
        <li>Under 13: account is not created and no data is kept.</li>
        <li>Age 13–15: account cannot be activated.</li>
        <li>Age 16–17: free account only; paid checkout is blocked.</li>
        <li>Age 18+: paid plans are available.</li>
      </ul>
    </form>
  );
}
