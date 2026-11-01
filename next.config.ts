import type { NextConfig } from "next";

// Browser colorize (DeOldify ONNX via onnxruntime-web) needs TWO
// script-src allowances, both proven 2026-11-01 — removing either
// silently breaks it again:
// 1. 'wasm-unsafe-eval': Chrome refuses to compile ANY WebAssembly
//    module without it, which kills the WASM fallback on every
//    browser without WebGPU. It allows wasm compilation ONLY —
//    unlike 'unsafe-eval', it does not allow JavaScript eval.
// 2. https://cdn.jsdelivr.net: onnxruntime-web dynamically imports
//    its helper module (ort-wasm-simd-threaded.jsep.mjs) from the
//    jsDelivr CDN at the pinned version in lib/browser/deoldify-core.
//    Without this origin, the import fails with "Failed to fetch
//    dynamically imported module" and NO backend is available at all
//    (the failure hides behind the first fix until the detailed
//    error is visible). connect-src alone is not enough — module
//    script loads are governed by script-src-elem.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://challenges.cloudflare.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://challenges.cloudflare.com https://*.supabase.co https://raw.githubusercontent.com https://cdn.jsdelivr.net",
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // Admin/account/signin/onboarding must never be indexed.
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/account/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/signin",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/onboarding",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
