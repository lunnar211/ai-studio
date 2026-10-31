"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Menu, X, Sparkles } from "lucide-react";
import { SISTER_SITE_URL, LEADSFORCEGEN_URL } from "@/lib/site";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/logo-generator", label: "Logo Generator" },
  { href: "/photo-enhancer", label: "Photo Enhancer" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/signin", label: "Sign in" },
  { href: "/account", label: "My account" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="inline-flex min-h-[44px] items-center rounded-[3px] px-3 font-medium hover:bg-cream dark:hover:bg-slate-800">
              {item.label}
            </Link>
          ))}
          <div className="relative">
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-[3px] px-3 font-medium hover:bg-cream dark:hover:bg-slate-800"
            >
              More tools <ChevronDown size={16} aria-hidden="true" />
            </button>
            {moreOpen && (
              <div className="absolute right-0 z-20 mt-1 w-56 border-2 border-line bg-white p-2 shadow-lg dark:bg-slate-900">
                <Link href={SISTER_SITE_URL} className="block min-h-[44px] rounded-[3px] px-3 py-2 font-medium hover:bg-cream dark:hover:bg-slate-800">
                  PDF Tools Hub
                </Link>
                <Link href={LEADSFORCEGEN_URL} className="block min-h-[44px] rounded-[3px] px-3 py-2 font-medium hover:bg-cream dark:hover:bg-slate-800">
                  LeadsForceGen
                </Link>
              </div>
            )}
          </div>
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
          {[...NAV, { href: SISTER_SITE_URL, label: "PDF Tools Hub" }, { href: LEADSFORCEGEN_URL, label: "LeadsForceGen" }].map((item) => (
            <Link key={item.href + item.label} href={item.href} className="block min-h-[44px] rounded-[3px] px-2 py-2.5 font-medium hover:bg-cream dark:hover:bg-slate-800" onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <div className="pt-2"><ThemeToggle /></div>
        </nav>
      )}
    </header>
  );
}
