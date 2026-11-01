import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

// Minimal RFC 6238 TOTP (SHA-1, 30s step, 6 digits) + AES-256-GCM secret
// storage. No extra dependency; verified by unit tests in tests/totp.test.ts.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function randomTotpSecret(): string {
  const bytes = randomBytes(20);
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totpCode(secret: string, atMs = Date.now(), window = 0): string {
  const key = base32Decode(secret);
  const counter = Math.floor(atMs / 30000) + window;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret: string, code: string, atMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((w) => totpCode(secret, atMs, w) === code);
}

// Encryption key derived from server-only TOTP_SECRET (formerly
// AUTH_SECRET, renamed in the Supabase Auth rework — AUTH_SECRET no longer
// exists). The "unset" fallback keeps unit tests deterministic; the
// setup/verify ROUTES refuse to run without TOTP_SECRET, so production
// secrets are never encrypted under the fallback key. Rotating
// TOTP_SECRET still requires TOTP re-enrollment (old ciphertexts stop
// decrypting), exactly as AUTH_SECRET rotation did before.
function totpKey(): Buffer {
  return createHash("sha256")
    .update(`ai-studio-totp:${process.env.TOTP_SECRET || "unset"}`)
    .digest();
}

export function encryptTotpSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", totpKey(), iv);
  const ct = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptTotpSecret(encrypted: string): string {
  const buf = Buffer.from(encrypted, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", totpKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function otpauthUrl(secret: string, email: string): string {
  return `otpauth://totp/AI%20Studio:${encodeURIComponent(email)}?secret=${secret}&issuer=AI%20Studio&algorithm=SHA1&digits=6&period=30`;
}
