import type { Metadata } from "next";
import Link from "next/link";

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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold italic">Admin</h1>
      <p className="mt-2 text-sm text-muted-fg dark:text-slate-400">
        Keyboard: press <kbd>/</kbd> on the Users page to focus search. Admin access requires
        Google sign-in plus TOTP two-factor verification (valid 12 hours).
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
