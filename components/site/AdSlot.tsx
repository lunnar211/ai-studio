"use client";

import { useState } from "react";

// AdSense slot: renders NOTHING unless (a) a publisher ID is set AND
// (b) the visitor accepted the cookie banner (consent stored in
// localStorage as "ai-studio-cookie-choice" = "accepted").
// Never enable ads before AdSense approval. This component is never placed
// on /signin, /admin or /account pages, and never on empty pages.
export function AdSlot({ slot }: { slot?: string }) {
  const publisher = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;
  // Read consent lazily on first client render (no setState-in-effect).
  const [consented] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("ai-studio-cookie-choice") === "accepted";
    } catch {
      return false;
    }
  });
  if (!publisher || !consented) return null;
  return (
    <div className="my-8 border-2 border-line bg-white p-4 text-center text-sm text-muted-fg" aria-label="Advertisement">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={publisher}
        data-ad-slot={slot ?? ""}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
