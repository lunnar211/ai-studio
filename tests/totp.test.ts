import { describe, expect, it } from "vitest";
import { decryptTotpSecret, encryptTotpSecret, totpCode, verifyTotp } from "../lib/totp";

describe("TOTP (RFC 6238)", () => {
  // RFC 6238 SHA-1 test vector: secret = base32("12345678901234567890"),
  // t = 59s -> 8-digit 94287082, so 6-digit 287082.
  const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  it("matches the RFC vector", () => {
    expect(totpCode(SECRET, 59_000)).toBe("287082");
  });
  it("verifies with +-1 step tolerance and rejects wrong codes", () => {
    expect(verifyTotp(SECRET, "287082", 59_000)).toBe(true);
    expect(verifyTotp(SECRET, "287082", 59_000 + 30_000)).toBe(true);
    expect(verifyTotp(SECRET, "000000", 59_000)).toBe(false);
    expect(verifyTotp(SECRET, "abc", 59_000)).toBe(false);
  });
  it("encrypts and decrypts the secret (AES-256-GCM)", () => {
    const enc = encryptTotpSecret(SECRET);
    expect(enc).not.toContain(SECRET);
    expect(decryptTotpSecret(enc)).toBe(SECRET);
  });
});
