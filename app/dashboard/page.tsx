import { redirect } from "next/navigation";
import type { Metadata } from "next";

// /account IS the live dashboard for AI Studio: it shows live usage,
// plan, logo history, photo jobs, subscriptions, and payments from the
// shared LeadForge database — nothing demo, nothing hardcoded. This
// route exists so the /dashboard URL the owner expects works too; it
// redirects rather than duplicating the page (a duplicate would drift).
// LeadsForceGen's /dashboard is a lead-search tool, not an account
// overview, so it is not a template to mirror here. Like /account,
// this page is never listed in the sitemap.
export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  redirect("/account");
}
