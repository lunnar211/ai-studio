// Signed device cookie + per-device concurrency guard.
//
// The cookie holds a random device id plus an HMAC signature made with
// TOTP_SECRET (the per-site server secret). It is NOT an identity and
// NOT a login: it only lets rate limits and concurrency caps distinguish
// two browsers behind one shared IP. When TOTP_SECRET is unset, no
// cookie is issued and limits fall back to IP-only (reported honestly
// by the capabilities endpoint).

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const DEVICE_COOKIE = "ai-device";

function secret(): string | null {
  return process.env.TOTP_SECRET || null;
}

function sign(deviceId: string): string {
  const s = secret();
  if (!s) return "";
  return createHmac("sha256", s).update(deviceId).digest("hex").slice(0, 32);
}

/** Create a fresh signed device cookie value. */
export function newDeviceCookie(): string | null {
  if (!secret()) return null;
  const id = randomBytes(16).toString("hex");
  return `${id}.${sign(id)}`;
}

/** Validate a device cookie value; returns the device id or null. */
export function parseDeviceCookie(value: string | null | undefined): string | null {
  if (!value || !secret()) return null;
  const [id, sig] = value.split(".");
  if (!id || !sig) return null;
  const expected = sign(id);
  try {
    if (sig.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return id;
}

export function deviceCookieHeader(value: string): string {
  return `${DEVICE_COOKIE}=${value}; Path=/; Max-Age=${365 * 24 * 60 * 60}; SameSite=Lax; Secure; HttpOnly`;
}

// In-memory in-flight job counter per (ip + device). Serverless
// instances each keep their own counter; this is a best-effort guard
// against one visitor stacking long jobs, not a distributed lock.
const inFlight = new Map<string, number>();
const MAX_CONCURRENT_PER_DEVICE = 2;

export function concurrencyKey(ip: string, deviceId: string | null): string {
  return `${ip}|${deviceId ?? "no-device"}`;
}

export function tryStartJob(key: string): boolean {
  const n = inFlight.get(key) ?? 0;
  if (n >= MAX_CONCURRENT_PER_DEVICE) return false;
  inFlight.set(key, n + 1);
  return true;
}

export function endJob(key: string): void {
  const n = inFlight.get(key) ?? 0;
  if (n <= 1) inFlight.delete(key);
  else inFlight.set(key, n - 1);
}
