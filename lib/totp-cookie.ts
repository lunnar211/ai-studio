// Second-factor proof, Edge-safe (WebCrypto only, no Node imports).
// After a verified TOTP code, the server sets a signed cookie
// `ai-studio-totp` = base64url(userId) + "." + expiryMs + "." + HMAC.
// Middleware accepts it OR a JWT totpVerifiedAt within 12h, whichever is
// present. The cookie is httpOnly, sameSite=lax, path=/admin (+ /api/admin
// via the API guard reading the same cookie).
export const TOTP_COOKIE = "ai-studio-totp";
export const TOTP_WINDOW_MS = 12 * 60 * 60 * 1000;

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const pad = s + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`ai-studio-totp-v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signTotpCookie(userId: string, secret: string, atMs = Date.now()): Promise<string> {
  const exp = atMs + TOTP_WINDOW_MS;
  const payload = `${b64urlEncode(new TextEncoder().encode(userId))}.${exp}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifyTotpCookie(
  cookie: string | undefined | null,
  userId: string,
  secret: string,
  atMs = Date.now()
): Promise<boolean> {
  if (!cookie || !secret) return false;
  try {
    const parts = cookie.split(".");
    if (parts.length !== 3) return false;
    const [uidB64, expStr, sigB64] = parts;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp <= atMs) return false;
    if (new TextDecoder().decode(b64urlDecode(uidB64)) !== userId) return false;
    const payload = `${uidB64}.${expStr}`;
    const key = await hmacKey(secret);
    return await crypto.subtle.verify("HMAC", key, b64urlDecode(sigB64), new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}
