import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-page";
import { SetupForm } from "./SetupForm";

export const metadata: Metadata = { title: "Set up two-factor authentication — AI Studio", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Setup2faPage() {
  await requireAdminPage(["SUPER", "SUPPORT", "FINANCE"], { skipTotp: true });
  return (
    <div className="max-w-xl space-y-4">
      <h2 className="text-2xl font-bold">Set up two-factor authentication</h2>
      <SetupForm />
    </div>
  );
}
