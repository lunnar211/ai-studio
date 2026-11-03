"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, Sparkles } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

const BASE_NAV = [
  { href: "/logo-generator", label: "Logo Generator" },
  { href: "/photo-enhancer", label: "Photo Enhancer" },
  { href: "/audio-cleaner", label: "Audio Cleaner" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

// Other-project links live in the FOOTER only (Phase 3): the header
// never links away to sister sites. "My account" is shown only when
// signed in and "Sign in" only when signed out; while the session
// check is pending, neither account link is shown (no wrong link
// flashes). The check is a tiny /api/auth/me call that returns only
// { signedIn } — no personal data — so public pages stay static.
export function Header() {
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.signedIn === "boolean") setSignedIn(d.signedIn);
        else if (!cancelled) setSignedIn(false);
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const nav = [
    ...BASE_NAV,
    // Discoverability only: linking to /admin never grants access —
    // the admin pages and APIs still enforce admin role + fresh TOTP
    // server-side, fail-closed, exactly as before.
    ...(signedIn ? [{ href: "/account", label: "My account" }, { href: "/admin", label: "Admin" }] : []),
    ...(signedIn === false ? [{ href: "/signin", label: "Sign in" }] : []),
  ];
  return (
    <header className="border-b-2 border-line bg-white dark:bg-slate-950">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex min-h-[44px] items-center gap-2 font-display text-2xl font-bold italic" aria-label="AI Studio home">
          <span className="flex h-9 w-9 items-center justify-center rounded-[3px] bg-brand text-white" aria-hidden="true">
            <Sparkles size={20} />
          </span>
          AI Studio
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="inline-flex min-h-[44px] items-center rounded-[3px] px-3 font-medium hover:bg-cream dark:hover:bg-slate-800">
              {item.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
        <button
          type="button"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[3px] border-2 border-line lg:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <nav aria-label="Mobile" className="border-t-2 border-line px-4 py-3 lg:hidden">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="block min-h-[44px] rounded-[3px] px-2 py-2.5 font-medium hover:bg-cream dark:hover:bg-slate-800" onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <div className="pt-2"><ThemeToggle /></div>
        </nav>
      )}
    </header>
  );
}
