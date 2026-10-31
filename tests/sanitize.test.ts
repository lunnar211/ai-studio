import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "../lib/svg-sanitize";
import { hashIp } from "../lib/ip-hash";
import { classifyPaddleEvent, paddlePlanForStatus } from "../lib/paddle";

describe("SVG sanitizer", () => {
  it("keeps safe shapes and strips scripts, handlers and external refs", () => {
    const out = sanitizeSvg(
      `<svg viewBox="0 0 512 512"><script>alert(1)</script><circle cx="10" cy="10" r="5" fill="red" onclick="evil()" /><path d="M0 0h10" href="https://example.com" /></svg>`
    );
    expect(out).not.toBeNull();
    expect(out).not.toContain("script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("https://");
    expect(out).toContain("<circle");
  });
  it("rejects non-SVG input", () => {
    expect(sanitizeSvg("hello world")).toBeNull();
  });
});

describe("IP hashing", () => {
  it("is deterministic and separates IPs", () => {
    expect(hashIp("203.0.113.10")).toBe(hashIp("203.0.113.10"));
    expect(hashIp("203.0.113.10")).not.toBe(hashIp("203.0.113.11"));
    expect(hashIp("203.0.113.10")).not.toContain("203.0.113.10");
  });
});

describe("Paddle event classification", () => {
  it("classifies handled events and ignores the rest", () => {
    expect(classifyPaddleEvent("transaction.completed")).toBe("transaction");
    expect(classifyPaddleEvent("subscription.canceled")).toBe("subscription");
    expect(classifyPaddleEvent("subscription.cancelled")).toBe("subscription");
    expect(classifyPaddleEvent("transaction.updated")).toBe("ignored");
  });
  it("maps active-like statuses to PREMIUM", () => {
    expect(paddlePlanForStatus("active")).toBe("PREMIUM");
    expect(paddlePlanForStatus("trialing")).toBe("PREMIUM");
    expect(paddlePlanForStatus("canceled")).toBe("FREE");
  });
});
