// Regression guard for the 2026-11-01 browser-colorize outage:
// the live site's CSP blocked WebAssembly compilation, which broke
// the onnxruntime-web WASM fallback on every browser without WebGPU.
// The fix is the 'wasm-unsafe-eval' keyword in script-src. If anyone
// removes it, browser colorize silently breaks again — this test
// fails loudly instead.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("CSP allows WebAssembly for browser colorize", () => {
  it("script-src in next.config.ts contains 'wasm-unsafe-eval'", () => {
    const config = readFileSync(join(__dirname, "..", "next.config.ts"), "utf8");
    const scriptSrc = config
      .split("\n")
      .find((line) => line.includes("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).toContain("'wasm-unsafe-eval'");
  });

  it("does not fall back to broad 'unsafe-eval' for scripts", () => {
    const config = readFileSync(join(__dirname, "..", "next.config.ts"), "utf8");
    const scriptSrc = config
      .split("\n")
      .find((line) => line.includes("script-src"));
    // 'wasm-unsafe-eval' contains 'unsafe-eval' as a substring, so
    // strip it before checking for the broad keyword.
    const withoutWasm = (scriptSrc ?? "").replaceAll("'wasm-unsafe-eval'", "");
    expect(withoutWasm).not.toContain("'unsafe-eval'");
  });
});
