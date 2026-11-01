import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionSafe } from "@/lib/auth";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = {
  title: "Confirm your age — AI Studio",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getSessionSafe();
  if (!session?.user) redirect("/signin");
  if (session.user.ageConfirmed) redirect("/account");
  if (session.user.status === "SUSPENDED") redirect("/signin?error=suspended");
  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-4xl font-bold italic">One quick check</h1>
      <p className="mt-3 text-lg text-muted-fg dark:text-slate-300">
        Before your account activates, confirm your age. This is a self-declaration —
        we never ask for an ID document.
      </p>
      <OnboardingForm />
    </div>
  );
}
