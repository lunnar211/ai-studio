"use client";
import { useEffect, useState } from "react";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("ai-studio-cookie-choice")) setVisible(true);
    } catch {
      setVisible(false);
    }
  }, []);
  if (!visible) return null;
  const choose = (value: string) => {
    try { localStorage.setItem("ai-studio-cookie-choice", value); } catch { /* ignore */ }
    setVisible(false);
  };
  return (
    <div role="region" aria-label="Cookie consent" className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-line bg-white p-4 shadow-lg dark:bg-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base">
          We use only essential cookies plus optional analytics. Choose to accept analytics or decline and keep essentials only.
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => choose("accepted")} className="min-h-[44px] rounded-[3px] border-2 border-brand bg-brand px-4 font-semibold text-white">Accept</button>
          <button type="button" onClick={() => choose("declined")} className="min-h-[44px] rounded-[3px] border-2 border-line bg-white px-4 font-semibold dark:bg-slate-900">Decline</button>
        </div>
      </div>
    </div>
  );
}
