// Regression guard for the 2026-11-01 browser-colorize outage:
// the live site's CSP blocked WebAssembly compilation, which broke
// the onnxruntime-web WASM fallback on every browser without WebGPU.
// The fix is the 'wasm-unsafe-eval' keyword in script-src. If anyone
// removes it, browser colorize silently breaks again — this test
// fails loudly instead.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The actual directive line in the csp array, NOT a comment line:
// comment lines above it also mention script-src, and picking the
// first match made these tests read a comment instead of the config.
function scriptSrcLine(): string {
  const config = readFileSync(join(__dirname, "..", "next.config.ts"), "utf8");
  const line = config
    .split("\n")
    .find((l) => l.trim().startsWith('"script-src'));
  expect(line).toBeDefined();
  return line as string;
}

describe("CSP allows WebAssembly for browser colorize", () => {
  it("script-src in next.config.ts contains 'wasm-unsafe-eval'", () => {
    expect(scriptSrcLine()).toContain("'wasm-unsafe-eval'");
  });

  it("script-src in next.config.ts allows the ORT CDN for module imports", () => {
    // onnxruntime-web dynamically imports its jsep helper module
    // from jsDelivr; without this origin the import fails and no
    // backend is available (proven 2026-11-01 via a script-src-elem
    // violation in a two-origin Playwright check).
    expect(scriptSrcLine()).toContain("https://cdn.jsdelivr.net");
  });

  it("does not fall back to broad 'unsafe-eval' for scripts", () => {
    const scriptSrc = scriptSrcLine();
    // 'wasm-unsafe-eval' contains 'unsafe-eval' as a substring, so
    // strip it before checking for the broad keyword.
    const withoutWasm = (scriptSrc ?? "").replaceAll("'wasm-unsafe-eval'", "");
    expect(withoutWasm).not.toContain("'unsafe-eval'");
  });
});
