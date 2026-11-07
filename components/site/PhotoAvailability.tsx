"use client";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/field";

// Live colorize/restore status, read from /api/photo/capabilities —
// the same flag the photo enhancer gates on. Static pages must never
// promise colorize works: this box is the live truth, and it flips on
// its own the day the server is set up (DATABASE_URL + prisma db push).
// While it loads, nothing renders — the surrounding static copy already
// says colorize/restore are not set up right now.
export function PhotoAvailability() {
  const [colorize, setColorize] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/photo/capabilities")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.colorize === "boolean") setColorize(d.colorize);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);
  if (colorize === null) return null;
  if (colorize) {
    return (
      <div className="mt-4 max-w-2xl">
        <Alert kind="success">Colorize and restore are available right now — free and unlimited on the free tier.</Alert>
      </div>
    );
  }
  return (
    <div className="mt-4 max-w-2xl">
      <Alert kind="info">Colorize and restore are not set up right now, so they are unavailable. Photo enhance works — free and unlimited — and the photo enhancer will offer colorize and restore again once the server is set up.</Alert>
    </div>
  );
}
