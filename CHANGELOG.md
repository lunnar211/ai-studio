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

## Phase 3 — conversion + trust (this change)

- Other-project links are FOOTER ONLY now: CrossPromo removed from all
  7 tool/use-case pages and the component deleted; "More tools"
  header dropdown removed; home "Our other projects" section removed.
  Footer still links PDF Tools Hub + LeadsForceGen.
- Cookie banner now REALLY gates analytics: <Analytics/> rendered
  unconditionally before (declining did nothing). New GatedAnalytics
  mounts Vercel Analytics only after "accepted"; the banner dispatches
  a window event so accepting mid-visit activates it without reload.
  AdSlot was already consent-gated (verified, left as-is).
- Header: "My account" shows only when signed in, "Sign in" only when
  signed out, via tiny new GET /api/auth/me (returns {signedIn} only,
  no personal data) so public pages stay static; neither link shows
  while the check is pending (no wrong-link flash).
- Privacy-friendly events (lib/analytics.ts, consent-gated + env
  kill-switch NEXT_PUBLIC_ANALYTICS_ENABLED=false): photo_upload,
  photo_mode, photo_result, photo_download, logo_generate,
  logo_download, upgrade_click. No prompts, filenames, or emails in
  event names. Never tracked without consent.
- Friendly 404 (not-found.tsx) + 500 (error.tsx, global-error.tsx).
- "Old photo restoration" section + 3-step How-it-works (shared
  RestoreSection) on home + photo-enhancer. Gallery of real
  before/after examples DEFERRED to the end (speed note): it needs
  verified public-domain photos with credit lines, and no synthetic
  image will be presented as a real photo.
- Health check: GET /api/health returns {ok, service, time} only.
- Delete-my-data flow verified intact in code (route + cascade +
  client sign-out); live check still needs an owner session.
- Lint fixes in touched files: LogoTool + CookieBanner setState-in-
  effect deferred via requestAnimationFrame; unused import removed.
- Verified: tsc clean, eslint clean on touched files, vitest 61/61,
  build EXIT=0.

## Phase 4 — SEO core (this change; landing pages deferred to the end)

- Brand appears ONCE in every <title>: 12 pages had "— AI Studio"
  in their title AND the "%s | AI Studio" template, producing
  "… | AI Studio | AI Studio" — suffixes removed so the template
  adds the brand exactly once. Home title already had it once.
- Home JSON-LD added: WebApplication + BreadcrumbList + FAQPage
  (built from the page's own FAQ list). Logo + enhancer pages
  already had SoftwareApplication + FAQPage (verified, kept).
- Per-page twitter tags added to home, logo-generator, and
  photo-enhancer matching each page's own OG text (photo page no
  longer inherits logo text).
- Sitemap + robots verified: public pages only; /admin, /account,
  /signin, /onboarding, /api disallowed. No new public pages in
  this phase, so no sitemap entries added.
- Core Web Vitals notes: next/font with display:swap (kept);
  enhancer <img> tags are user-uploaded blob URLs, so plain <img>
  is correct there (next/image cannot optimize blobs); slider
  aspect ratio is reserved. Lighthouse scores NOT measured: they
  need a live browser + reachable preview URL, both blocked on
  preview access (see report) — owed after preview is reachable.
- Landing pages (/colorize-black-and-white-photo,
  /restore-old-photos, /photo-upscaler) DEFERRED to the end per the
  speed note, with the gallery + Nepali switch.
- Verified: tsc clean, eslint clean on touched files, vitest 61/61,
  build EXIT=0.

## P0 — leak fix: neutral badges, 3 modes, image key pool (`8de51c9`)

- The live result text "Enhanced (standard quality — set REPLICATE_API_TOKEN for AI upscaling)"
  exposed the provider name and env var name to every visitor. It is gone: every API response and
  result UI now carries only generic messages ("Done. Output W x Hpx." / "Something went wrong.
  Please try again.") and the neutral badges "Quality: AI Enhanced" / "Quality: Standard".
  Real errors go to server logs (console.error) only. No key VALUE was ever shown, so no
  rotation was needed for this string — but the string itself is removed everywhere, including
  the capabilities route (booleans only), logo routes (no model/provider in responses), and
  the CSP (provider API origins removed in Phase 6 after verifying no client code calls them).
- Exactly 3 modes now: Enhance 1 / Colorize 2 / Restore + Colorize 3 credits (colorize-hd removed).
  AI is the default path; the Sharp pipeline runs only after every AI call fails.
- NEW lib/ai-pool.ts: AI_API_KEYS comma-separated IMAGE-provider key pool (Replicate tokens
  first; legacy REPLICATE_API_TOKEN appended automatically), round-robin + failover on
  429/401/402/5xx. LLM/text keys (Groq, Gemini, OpenRouter, NVIDIA, ElevenLabs) are never read
  here — they cannot colorize images. Model slugs/versions come from ENV ONLY (no hardcoded
  defaults). Sharp pre-resize to max 1536px before any AI call; independent steps via Promise.all;
  no tiling (the wired models expose no tiling parameter, so downscaling is the honest path).
  maxDuration 60 + runtime nodejs on the colorize route; progress stages incl. "restoring".
- GFPGAN restore input schema is PROVISIONAL (not token-verified — Replicate returned 401 for
  the model lookup and it was not re-requested). A wrong schema fails honestly with a notice,
  never a fake restore. CodeFormer stays excluded (S-Lab non-commercial licence).
- Verified at P0 close: tsc clean, eslint clean on touched files, vitest 73/73, build EXIT=0.

## Phase 5 — landing pages + brand-once titles + page OG images (`943c139`)

- NEW landing pages /colorize-black-and-white-photo, /restore-old-photos, /photo-upscaler,
  /ai-logo-maker: unique title/meta/OG/Twitter each, JSON-LD (SoftwareApplication + FAQPage +
  BreadcrumbList), unique content, FAQ, tool CTA, internal links to each other + tools +
  pricing + FAQ. Footer links all four. Sitemap gains the four pages; robots base URL fixed
  to the sandy-sigma host (still disallows /admin, /account, /signin, /onboarding, /api).
- Brand exactly once in every <title>: home title is absolute; Pricing/FAQ/use-case titles no
  longer carry the brand suffix (the template adds it once). OG/Twitter titles keep their own
  single brand mention (they are not templated).
- Photo-enhancer metadata now mentions colorize/restore/HD and still never mentions logos;
  its OG image is the new /og-photo.jpg. NEW page OG images (sharp, ~30 KB each):
  og-photo/colorize/restore/upscaler/logo.jpg.
- Analytics events verified firing + consent-gated (photo_upload/mode/result/download,
  upgrade_click). Core Web Vitals by inspection: next/font display:swap, reserved slider
  aspect, no static <img> (only user blob URLs + QR data URL).
- Verified: tsc clean, eslint clean on touched files, vitest 73/73, build EXIT=0.

## Phase 6 — security, reliability, quality (`6bd1d3b`)

- NEW lib/concurrency.ts: fail-fast cap on concurrent AI prediction starts
  (AI_MAX_CONCURRENT_STARTS, default 10; in-memory, same single-instance scope as the rate
  limiter). Wired into routeColorizeStart/routeUpscaleStart/routeRestoreStart; a full slot
  returns a rate-limited error the routes already map to a friendly 429.
- CSP tightened: api.groq.com + api.replicate.com removed from connect-src after verifying no
  client code fetches those hosts (all AI calls go through server routes). Security headers
  verified live on the local server: CSP, HSTS, X-Frame DENY, nosniff, Referrer, Permissions.
- Paddle webhook: signature verified via SDK + idempotent (pre-existing, now covered by
  tests/paddle-webhook.test.ts: missing/bogus signature -> 400 before any DB write).
- Schema validation (zod) on colorize/enhance routes, safe generic error messages, structured
  error log (errorLog + /admin/logs), health endpoint GET /api/health (200, liveness only).
  Rate limiting 5/min per IP + 10 MB size limit verified live (6th request in a minute -> 429;
  corrupted/oversize -> 400 generic; valid enhance -> 200 X-Quality: standard with no keys).
- NEW tests: file-validate (magic bytes), grayscale (server gate), rate-limit (5/min
  in-memory), credits (1/2/3 costs, 10/100 budgets), concurrency slots, manual-image-set
  (100KB B&W portrait, ~9MB scan, colour, corrupted, transparent PNG, EXIF rotation, tiny
  thumbnail, scratched photo, 1536px cap). NEW e2e a11y-mobile spec: 360px no-overflow on
  home, both tools, one landing page; keyboard-only tab reachability; landing CTA href.
  Fixed a pre-existing env-dependent pricing test (Paddle unconfigured locally shows the
  honest unconfigured message). vitest alias "@" added to vitest.config.ts so route modules
  can be tested directly.
- Contrast fix: primary buttons now use the dark brand/accent variants (white text on #EC4899 /
  #0891B2 failed AA); accessibility 100 on all measured pages after the fix.
- Lighthouse (local `next start`, real runs, NOT production): Home 96/100/100/100;
  colorize landing 91/100/100/100; photo-enhancer performance varied 91/89/84 across runs
  (total-blocking-time on sandbox CPU) with a11y/BP/SEO 100 — the 90+ performance target is
  NOT reliably met locally and must be re-measured on the preview.
- Verified: tsc clean, eslint clean on touched files, vitest 102/102, Playwright 19/19,
  build EXIT=0.

## Polish — public-domain gallery on Home (`c38fb35`)

- 3 real 19th-century photographs (public domain via Wikimedia Commons) in public/gallery,
  verified grayscale (mean chroma 0.0) after a faithful sepia-to-black-and-white conversion,
  so they pass the tool's own grayscale gate. No synthetic image is presented as a real photo
  and no fake "after" image is shown: the section is explicitly labelled as originals, not
  results, with a source-file link + credit line per photo and a CTA to colorize.
  Gallery uses next/image with lazy loading.
- Nepali language switch: NOT built (deferred, optional) — a partial toggle would show
  mixed-language pages; full translation needs professional Nepali copy for all tool flows.
  Recorded as an open item, not silently dropped.
- Verified: tsc clean, eslint clean, vitest 102/102, Playwright 19/19 (incl. 360px overflow
  on Home with the gallery), build EXIT=0, gallery images 200 on local server.
