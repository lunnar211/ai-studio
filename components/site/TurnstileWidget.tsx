"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset?: (id?: string) => void };
    onTurnstileSuccess?: (token: string) => void;
  }
}

export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref = useRef<HTMLDivElement>(null);
  const tokenRef = useRef(onToken);
  tokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    window.onTurnstileSuccess = (token: string) => tokenRef.current(token);
    const scriptId = "cf-turnstile-script";
    const render = () => {
      if (ref.current && window.turnstile && !ref.current.hasChildNodes()) {
        window.turnstile.render(ref.current, { sitekey: siteKey, callback: "onTurnstileSuccess" });
      }
    };
    if (window.turnstile) {
      render();
    } else if (!document.getElementById(scriptId)) {
      const s = document.createElement("script");
      s.id = scriptId;
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      s.defer = true;
      s.onload = render;
      document.head.appendChild(s);
    } else {
      const t = setInterval(() => {
        if (window.turnstile) { render(); clearInterval(t); }
      }, 500);
      return () => clearInterval(t);
    }
  }, [siteKey]);

  if (!siteKey) return null;
  return (
    <div>
      <div ref={ref} />
      <p className="mt-1 text-sm text-muted-fg dark:text-slate-400">Bot check by Cloudflare Turnstile.</p>
    </div>
  );
}
