"use client";
import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/next";

// Vercel Analytics, mounted ONLY after the visitor accepts the cookie
// banner (choice stored as localStorage "ai-studio-cookie-choice" =
// "accepted"). Previously <Analytics/> rendered unconditionally while
// the banner promised optional analytics — declining did nothing.
// Now: declined (or undecided) => no Analytics component at all.
// The banner dispatches a "ai-studio-cookie-choice" window event on
// every choice so accepting mid-visit activates analytics without a
// reload; the storage event covers other tabs.
export function GatedAnalytics() {
  const [consented, setConsented] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setConsented(localStorage.getItem("ai-studio-cookie-choice") === "accepted");
      } catch {
        setConsented(false);
      }
    };
    read();
    window.addEventListener("ai-studio-cookie-choice", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("ai-studio-cookie-choice", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  if (!consented) return null;
  return <Analytics />;
}
