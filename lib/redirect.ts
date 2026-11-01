// Safe post-login redirect validation. Only same-site relative paths are
// allowed: anything else (absolute URLs, protocol-relative URLs, backslash
// tricks, encoded slashes, control characters) falls back. This is the
// single open-redirect guard for /auth/callback and /signin?next=.
export function safeRedirectPath(value: unknown, fallback = "/account"): string {
  if (typeof value !== "string" || !value) return fallback;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.startsWith("/\\") ||
    decoded.includes("\\") ||
    decoded.includes("://") ||
    /[\x00-\x1f\x7f]/.test(decoded)
  ) {
    return fallback;
  }
  return decoded;
}
