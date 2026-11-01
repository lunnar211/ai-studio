import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "../lib/redirect";

describe("safeRedirectPath (open-redirect guard for /auth/callback)", () => {
  it("accepts plain same-site paths", () => {
    expect(safeRedirectPath("/account")).toBe("/account");
    expect(safeRedirectPath("/admin/users")).toBe("/admin/users");
    expect(safeRedirectPath("/")).toBe("/");
  });
  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeRedirectPath("https://evil.example.com")).toBe("/account");
    expect(safeRedirectPath("http://evil.example.com/phish")).toBe("/account");
    expect(safeRedirectPath("//evil.example.com")).toBe("/account");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/account");
  });
  it("rejects backslash and encoded-slash tricks", () => {
    expect(safeRedirectPath("/\\evil.example.com")).toBe("/account");
    expect(safeRedirectPath("/%2fevil.example.com")).toBe("/account");
    expect(safeRedirectPath("/account\\@evil.example.com")).toBe("/account");
    expect(safeRedirectPath("https%3A%2F%2Fevil.example.com")).toBe("/account");
  });
  it("rejects empty, non-string, and control-character values", () => {
    expect(safeRedirectPath("")).toBe("/account");
    expect(safeRedirectPath(null)).toBe("/account");
    expect(safeRedirectPath(undefined)).toBe("/account");
    expect(safeRedirectPath("/account\n")).toBe("/account");
  });
  it("honours a custom fallback", () => {
    expect(safeRedirectPath("https://evil.example.com", "/")).toBe("/");
  });
});
