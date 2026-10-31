import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-page";
import { VerifyForm } from "./VerifyForm";

export const metadata: Metadata = { title: "Verify two-factor authentication — AI Studio", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Verify2faPage() {
  await requireAdminPage(["SUPER", "SUPPORT", "FINANCE"]);
  return (
    <div className="mx-auto max-w-md">
      <h2 className="text-2xl font-bold">Two-factor verification</h2>
      <p className="mt-2 text-muted-fg dark:text-slate-300">Enter the current code from your authenticator app to access the admin panel.</p>
      <div className="mt-4"><VerifyForm /></div>
    </div>
  );
}
