"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Footer Admin link, shown ONLY when the visitor is signed in AND an
// admin — same /api/auth/me probe the header uses (returns only
// { signedIn, isAdmin }, no personal data), so public pages stay static
// and no wrong link flashes while the check is pending. Linking to
// /admin never grants access: the admin layout and every admin page/API
// still enforce admin role + TOTP server-side. A signed-out visitor, or
// a signed-in non-admin, simply never sees the link.
export function FooterAdminLink() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setIsAdmin(d && d.signedIn === true && d.isAdmin === true);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!isAdmin) return null;
  return (
    <li>
      <Link href="/admin" className="inline-flex min-h-[44px] items-center hover:underline">
        Admin
      </Link>
    </li>
  );
}
