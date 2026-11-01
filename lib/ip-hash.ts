import { createHash, createHmac } from "node:crypto";

// Only HASHED IPs are stored (ipHash fields). Salt comes from TOTP_SECRET
// (server-only; formerly AUTH_SECRET, renamed in the Supabase Auth rework);
// if TOTP_SECRET is unset, hashing still works with a fixed fallback salt
// but admin audit rows are best-effort only in that state.
export function hashIp(ip: string): string {
  const salt = process.env.TOTP_SECRET || "ai-studio-no-secret-set";
  return createHmac("sha256", salt).update(ip).digest("hex");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
