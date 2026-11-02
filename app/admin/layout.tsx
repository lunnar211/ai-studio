import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminLayout } from "@/lib/admin-page";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/money", label: "Money" },
  { href: "/admin/usage", label: "Usage & abuse" },
  { href: "/admin/ai-health", label: "AI health" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/database", label: "Database" },
  { href: "/admin/support", label: "Support inbox" },
  { href: "/admin/logs", label: "Logs" },
];

// Hard gate: no session, no admin role, or a suspended account is
// redirected to /signin BEFORE any admin heading, nav, or content
// renders. TOTP is deliberately not checked here (setup-2fa and
// verify-2fa must render without it); every page enforces TOTP itself.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminLayout();
  return (
    <div>
      <h1 className="font-display text-4xl font-bold italic">Admin</h1>
      <p className="mt-2 text-sm text-muted-fg dark:text-slate-400">
        Keyboard: press <kbd>/</kbd> on the Users page to focus search. Admin access requires
        sign-in plus TOTP two-factor verification (valid 12 hours).
      </p>
      <nav aria-label="Admin" className="mt-4 flex flex-wrap gap-2">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-line bg-white px-3 font-medium hover:border-brand dark:bg-slate-900"
          >
            {l.label}
          </Link>
        ))}
        <Link
          href="/admin/setup-2fa"
          className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-line bg-white px-3 font-medium hover:border-brand dark:bg-slate-900"
        >
          Two-factor setup
        </Link>
      </nav>
      <div className="mt-6">{children}</div>
    </div>
  );
}
