# CHANGELOG — AI Studio

All work on the `full-upgrade` branch unless noted. Production
(master) is untouched; do not merge without the owner's approval.

## Phase 0 — multi-provider AI layer (`542866b`, on master, not pushed to production)

- `lib/ai/` router: Groq, Gemini, OpenRouter, NVIDIA, ElevenLabs,
  Replicate, Sharp-local adapters; Hugging Face adapter disabled
  (vault token 401). Circuit breaker, timeout + 1 retry, fallback,
  cost-aware routing, per-provider spend cap with 80% alert.
- Single limits config (`lib/limits.ts`): photo credits Free 10/day,
  Premium 100/day (Enhance 1 / Colorize-Restore 2 / Colorize+HD 3);
  logo requests Free 10/day, Premium 100/day. Signed-in free = same
  10/day as guest.
- `AiUsageLog` table (needs the owner's schema push) + `/admin/ai-health`.
- Logo route on the router (3 variants, 120b primary + 20b fallback);
  enhance route on `routeUpscale`; Whisper transcribe route; mic button.
- Tests: vitest 46/46 at Phase 0 close; `tsc` clean; build EXIT=0.

## Phase 1 — B&W to colour, HD, on /photo-enhancer (Tier C) (`98d81fd`, `f25fea8`)

- Async PhotoJob state machine (poll-driven, Vercel-safe): DDColor
  colorize -> LAB-merge (original L + model a/b, intensity-scaled) ->
  optional Real-ESRGAN upscale -> Sharp standard fallback for the
  upscale step only, labelled honestly.
- Mode cards (Enhance / Colorize / Colorize+HD / Restore), local
  grayscale detection, advanced panel (style, era, intensity,
  format, scale, face enhance), before/after slider + side-by-side +
  zoom, downloads, cancel + retry + resume via `?job=`.
- Honest gates: colorize on colour photos refused server-side; HD 4x
  and face enhance Premium-only; credits shown before the click.
- `f25fea8` fixed the preview build: color constants moved to a
  client-safe module (no Sharp in the client bundle).
- Local verification: vitest 46/46, `tsc` clean, build EXIT=0.
  Preview deployment `dpl_D3xZeHqHrcj54mMF2AsNyB6uZSRf` is READY but
  not yet live-verified (Vercel Deployment Protection blocks curl;
  owner must authorize the Vercel connection or provide a bypass).

## Phase 1b — free-first tiers: browser + own Space + routing (this change)

- Tier A (browser): DeOldify INT8 ONNX (~25 MB) via ONNX Runtime Web
  (WebGPU first, WASM fallback) in a Web Worker; Cache API caching;
  download progress with real byte counts + ~25 MB size; LAB-merge
  with the original luminance (sharper than the reference write-up's
  plain upscale); output capped at 2048px; intensity slider applies.
  Unlimited, no credits, photo never leaves the device. Offered for
  plain Colorize: first for Free users, as a fallback for Premium.
- Tier B (own Space): server Gradio client (`lib/ai/gradio.ts`) —
  `@gradio/client` submit (upload + start) + raw SSE poll by event id
  (fits the poll-driven job machine); server-side HF_TOKEN only;
  private Space + cold-start copy in the UI; ZeroGPU quota honestly
  documented (5 min/day free). No pre-existing public DDColor Space
  was verified, so Tier B is a fresh Space from DDColor's official
  Gradio demo — exact steps in SETUP.md.
- Routing: Free = A -> B -> C; Premium = C -> B -> A (colorize).
  Server order in `lib/ai/tiers.ts`; browser order lives in the UI.
  Space kill-switch: admin `ai.provider.huggingface = false`.
- Schema: PhotoJob gains `preUpscaleData` (merged image before
  upscale) so the Sharp fallback never re-fetches a colorize output.
  Same owner push as AiUsageLog/LogoGeneration — no extra step.
- Docs: MODELS.md (every model, licence, where it runs), SETUP.md
  (Space steps + env vars + manual browser test), `.env.example`
  (HF_TOKEN / HF_SPACE_ID / HF_SPACE_API_NAME / HF_SPACE_HOST).
- Licences verified firsthand 2026-11-01: DDColor Apache-2.0, DeOldify
  MIT, Real-ESRGAN BSD-3-Clause, GFPGAN Apache-2.0. CodeFormer
  excluded (S-Lab 1.0, non-commercial). DDColor browser build and
  Real-ESRGAN browser ONNX file: NOT verified — not wired, not faked.
- New tests: `tests/browser-tiers.test.ts` (tensor spec, Lab merge,
  ORT version pin, tier order, Space SSE/host/file/poll).
- Deps: `onnxruntime-web@1.31.1`, `@gradio/client@2.7.2` (installed
  via npm; package.json + lockfile updated).

## Phase 2 — content + logic consistency (this change)

- Every limit number now comes from the single config (`lib/limits.ts`
  defaults for static pages; `getEffectiveLimits()` for dynamic
  pages). Fixed all four brief inconsistencies: footer/home
  "10 AI generations" -> 10 logo requests + 10 photo credits per day;
  Pricing now lists Premium HD 4x/4096px + face enhance + priority
  (Home already did); About/Terms "signed-in users get higher limits"
  -> signing in keeps the same free limits (FAQ already said so);
  download formats unified everywhere (logos SVG + PNG 1024; photos
  PNG/JPG/WebP).
- Pricing rewritten: real Paddle price fetched via the SDK
  (`getPaddlePriceDisplay`; monthly `PADDLE_PRICE_ID` + optional yearly
  `PADDLE_PRICE_ID_YEARLY`), comparison table, short refund summary
  (14 days, Paddle fee 5% + $0.50 non-refundable, cancel stops future
  billing). Upgrade buttons HIDE when Paddle is unconfigured — no dead
  checkout. Checkout route accepts `{billing: monthly|yearly}`.
- Privacy/FAQ/AI-disclosure now name EVERY provider that can receive
  data (Groq, OpenRouter, Gemini, NVIDIA, ElevenLabs, Replicate with
  its Apr 2026 retention policy + link, owner's HF Space, local
  Sharp, browser mode = no third party) and state the honest
  retention for each hop.
- New tests: `tests/paddle-price.test.ts` (price formatting).
- Verified: tsc clean, eslint clean on touched files, vitest 61/61,
  build EXIT=0.
