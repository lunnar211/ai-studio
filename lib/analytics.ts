// Privacy-friendly usage events. Fires ONLY when BOTH gates pass:
// (1) the owner has not disabled analytics (NEXT_PUBLIC_ANALYTICS_ENABLED
//     is anything but "false"), and (2) the visitor accepted the cookie
//     banner (localStorage "ai-studio-cookie-choice" = "accepted").
// Never tracked without consent. Event names carry NO personal data:
// no prompts, filenames, emails, or results — just the action.
// Transport is Vercel Analytics custom events (track()); when the
// Analytics component is not mounted, track() is a safe no-op.
import { track } from "@vercel/analytics";

export type AnalyticsEventName =
  | "photo_upload"
  | "photo_mode"
  | "photo_result"
  | "photo_download"
  | "logo_generate"
  | "logo_download"
  | "upgrade_click";

export function analyticsConsented(): boolean {
  try {
    return (
      process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "false" &&
      typeof window !== "undefined" &&
      localStorage.getItem("ai-studio-cookie-choice") === "accepted"
    );
  } catch {
    return false;
  }
}

export function trackEvent(name: AnalyticsEventName): void {
  if (!analyticsConsented()) return;
  try {
    track(name);
  } catch {
    // Analytics must never break a tool action.
  }
}
