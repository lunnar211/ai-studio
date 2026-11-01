# CHANGELOG — AI Studio

## 2026-11-01 — browser colorize fixed (master, live via auto-deploy)

- ROOT CAUSE (proven, not guessed): the site's CSP `script-src`
  had no `'wasm-unsafe-eval'`, so Chrome refused to compile ANY
  WebAssembly module. Browser colorize tries WebGPU first, but on
  every browser without WebGPU it falls back to WASM — which the CSP
  blocked — so it failed with the generic "failed on this device"
  message. Model URL, CORS, and jsDelivr WASM files were all verified
  healthy; they were never the problem. A Playwright check proved it:
  live CSP blocked `WebAssembly.compile`, the fixed CSP allowed it.
- FIX: `next.config.ts` script-src now includes `'wasm-unsafe-eval'`
  (allows wasm compilation ONLY, not JS eval — narrower than
  `'unsafe-eval'`). The photo tool now also shows the REAL engine
  error detail instead of only the generic message, so the next
  failure is diagnosable from the screen.
- REGRESSION TEST: `tests/csp-wasm.test.ts` fails if the keyword is
  ever removed, and fails if broad `'unsafe-eval'` creeps in.

## 2026-11-01 — browser colorize, second gate (same day, master)

- The first fix exposed a SECOND bug hiding behind it: the live
  re-test failed with "no available backend found" and a fetch
  failure for ORT's `ort-wasm-simd-threaded.jsep.mjs`. The file
  exists on jsDelivr (HTTP 200) and the installed ORT version is
  exactly the pinned 1.31.1, so the fetch was being refused, not
  missing. A two-origin Playwright proof named the gate:
  `script-src-elem` violation on the module URL; adding the origin
  to script-src made the import succeed.
- FIX: `script-src` now also includes `https://cdn.jsdelivr.net`
  (module script loads are governed by script-src-elem, so the
  existing connect-src entry was never enough). Regression test
  extended to fail if the CDN origin is ever removed.

## 2026-11-01 — sepia old photos refused colorize (same day, master)

- THE "STILL ERROR": the user's old photo was measured as
  "colour" (raw mean channel difference 24.6 vs threshold 8) and
  got Enhance-only, because age yellows old photos into sepia and
  sepia carries channel differences while containing no real colour
  information. Worse, in Restore mode the "Colorize anyway"
  override button did not exist, so a misclassified photo there had
  NO path to colorize at all.
- FIX: new shared sepia-aware rule (`lib/photo/monochrome.ts`,
  used by both browser and server detectors): monochrome when raw
  chroma < 8 OR under 35% of bright pixels are clearly colourful
  (saturation > 0.35, pixels darker than 40 ignored). Measured
  anchors: user sepia photo 0.248 → grayscale; pure B&W 0;
  natural colour photo 0.421 → colour; saturated graphic 0.972.
  "Colorize anyway" now shows in Restore mode too, the restore note
  follows the override, and the server restore path honors the
  override when deciding whether to colorize.
- REGRESSION TEST: `tests/monochrome.test.ts` (6 tests: grey,
  sepia mix, multi-hue colour, dark-pixel guard, 0.34/0.36
  boundary, RGB buffers).

## 2026-11-01 — sepia photos colorized with purple/blue blotches (same day, master)

- THE SECOND "STILL ERROR": the sepia-detection gate was fixed
  (live re-test offered "Colorize free in browser" and finished),
  but the result was NOT natural colour — subjects stayed
  sepia/grey with vivid purple/blue blotches at the edges.
- ROOT CAUSE, PROVEN WITH THE SAME MODEL: the browser pipeline
  fed the sepia photo straight to DeOldify, but DeOldify was
  trained on greyscale inputs. Same model, same photo:
  sepia input -> 28.8% of output pixels extreme blue;
  greyscale input -> 0.8%. (The pure-B&W live test passed
  earlier precisely because B&W input is already grey.)
- FIX: the 256x256 model input is now desaturated to true
  greyscale first (`toGrayscale` in `lib/browser/deoldify-core`,
  ITU-R 601 luma, same as PIL convert("L")), written back to the
  model-input canvas so BOTH the worker path and the main-thread
  fallback get grey. The original photo is untouched — the LAB
  merge still takes its detail from it, so nothing is lost.
- REGRESSION TEST: `tests/deoldify-grayscale.test.ts` (4 tests:
  sepia luma value, grey unchanged, alpha preserved, black/blue).
- NOTE FOR THE SERVER PATH: whenever server colorize/restore is
  built, its model input must be desaturated the same way —
  a tinted input will blotch there too.

## 2026-11-01 — iPhone: photo tool tab crashes + reloads (same day, master)

- REPORT: on the owner's iPhone, uploading + choosing
  Restore + Colorize crashed the tab and reloaded it.
- DESKTOP REPRO: a 4032x3024 sepia photo colorized fine
  (Done, 2048x1536px, no crash); a 20 MB PNG is cleanly
  refused by the 10 MB limit, not a crash. So the crash is
  phone-specific memory pressure, not a logic error — iOS
  kills tabs that spike memory (jetsam), and the old pipeline
  spiked hard: a 12 MP decoded photo (~48 MB) held through
  the whole run + three ~37 MB whole-image Lab buffers at
  2048px output, on top of the 64 MB model + WASM session.
- FIX: (1) the decoded photo is now released (`close()`)
  right after the two small draws, before the model runs;
  (2) the LAB merge runs in 256-row bands
  (`mergeColorizeBanded` in `lib/browser/lab.ts`) — the Lab
  functions are per-pixel, so banding is byte-identical
  output at a fraction of the peak (~6 MB of Lab buffers).
  Verified: the same 4032x3024 photo still finishes
  (Done, 2048x1536px) on the new build.
- REGRESSION TEST: `tests/lab-merge.test.ts` (banded vs
  whole-image merge byte-identical across band edges, plus
  single-pixel alpha case).

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

## Fix — free + unlimited photos, no dead end, "Colorize anyway" (this change)

Owner complaint (preview screenshot, 2026-11-01): Restore on a faded old photo showed
"looks like a colour photo", a red "Colorize is unavailable right now", and
"This will use 3 credits. Free: 10 photo credits per day." The credit line was the old
Free allowance, not a payment demand — but it read as a block, and free-tier jobs were
charged credits even when they ran on a free tier. Fixed:

- FREE = UNLIMITED, forever, for everyone including guests: free-tier jobs (browser ONNX
  Tier A + owner's HF Space Tier B + local Sharp) cost 0, have no daily cap, no credit
  balance, and no credit copy anywhere on free paths. The 5/min per-IP limiter STAYS —
  it is abuse protection, not a usage cap (it still allows thousands of uses per day).
- Paid-GPU (Replicate) stays Premium-only: every GPU photo bills the owner per run, so
  unlimited GPU would drain his money with no income. Premium = fast paid-GPU processing
  + HD 4x up to 4096px + face enhance + priority. Free users are routed to the free tiers
  first and NEVER to paid GPU — not even as a fall-through (tier order Free: Space only;
  Premium: paid GPU, then Space). Opening GPU to everyone needs a separate explicit
  owner decision with the cost warning attached.
- No dead end: when server colorize is unavailable, the page offers the free browser
  colorize path as the primary action ("Free — runs on your device, photo never leaves
  your device"), and server failure responses carry a `freeAlternative` (browser, or
  free Enhance for colour restore) so the UI offers the fitting free path instead of a
  red box. Restore on a colour photo with no server now offers free Enhance; B&W restore
  offers browser colorize with an honest "repair not included" note.
- "Colorize anyway" override: the grayscale gate is now a hint, never a block. Faded/sepia
  photos that measure as "colour" get the hint plus an override button; the user's explicit
  choice beats the gate on both client and server (`colorizeAnyway`, honored by
  `shouldRefuseColorize`). The gate itself still refuses plain server colorize on colour
  photos without the override. Restore mode was also fixed: the gate no longer blocks
  colour restore jobs (repair + upscale, no colorize) before they reach the restore branch.
- Free jobs never start a paid-GPU upscale either: after Space colorize, free jobs
  upscale with Sharp (standard quality, honestly labelled); the jobs poller finishes free
  jobs with the Sharp fallback instead of polling a GPU prediction that must not exist.
  Guest Enhance runs the local Sharp pipeline directly (verified: 32px fixture → 64px PNG,
  `X-Quality: standard`, 5/min headers).
- Model size corrected: the DeOldify browser model is ~64 MB (measured 64,020,138 bytes
  from the model host), not ~25 MB — the download progress copy and tests now say so.
- Copy rewritten to the new model everywhere: pricing (Free = unlimited via free routes;
  Premium = paid-GPU speed + HD 4x + face enhance + priority; no invented price, Upgrade
  still hidden when Paddle is unconfigured), FAQ, Home, About, Privacy, Terms, Footer,
  photo-enhancer page, the 3 photo landing pages, account page (no photo count/limit),
  admin labels (the free photo limit row is gone; Premium GPU budget row remains).
  Logo budgets are UNCHANGED (Free 10/day, Premium 100/day, 1 request = 3 variants).
- SETUP.md corrected: free fall-through is the browser path only (never Replicate);
  the result Details lines must NOT name provider/model (P0 rule — those live only in
  the server usage log); browser-path button label and model size updated.
- P0 intact: leak scan re-run — no provider/model/env names in any API response or result
  UI (public job state still returns only the neutral quality badge); magic-byte
  validation, 10 MB limit, 5/min limiter, in-memory processing only.
- Honest limits of this fix: the browser colorize path is wired (DeOldify ONNX, model
  file reachable at ~64 MB from the host) and its tensor math is unit-tested, but a full
  in-browser model run was NOT verified in the sandbox (sandbox Chromium has no internet
  to download the model). It is covered by an env-gated Playwright test
  (`E2E_BROWSER_COLORIZE=1`, skipped by default) for a real machine, plus the owner
  preview checklist below. Server colorize still needs the owner's HF Space + env vars +
  redeploy (SETUP.md §1–2) before the free server route works on the preview; until then
  the free browser path is the working free route.
- Verified: tsc clean, eslint clean, vitest 111/111, Playwright 22/22 (3 new free-photo
  specs + 1 env-gated real-weights spec skipped by default), build EXIT=0, local
  `next start` HTTP 200s on 9 pages, capabilities JSON shows `freeUnlimited: true` with
  no credit fields, guest enhance 200 + standard quality, colorize 503s carry the free
  alternative, and the colorizeAnyway override passes the server gate (503, not 400).
- Owner preview checklist: upload a B&W photo → free browser colorize works with 0
  credits → no credit block anywhere → "Colorize anyway" works on a faded photo → server
  colorize (once the Space is set up) works free and unlimited → network responses still
  leak-free. NEVER claimed preview-verified; merge to master still needs explicit approval.

## Fix — free + unlimited logos, no credit gate (this change)

Owner complaint (2026-11-01): the logo generator still asked for credits to generate,
after the photo tools had just been made free + unlimited. Fixed the same way:

- LOGOS = UNLIMITED, forever, for everyone including guests: the daily logo budgets
  (Free 10/day, Premium 100/day) are deleted from the single limits config, the logo
  generate route, and every page. No daily cap, no credit balance, no "will use credits"
  copy on any logo path. One request still gives 3 variants. The 5/min per-IP limiter
  STAYS on the generate route — abuse protection, not a usage cap.
- Removed, not bypassed: the signed-in daily quota check (`dailyQuota("logo")` + Job-row
  counting), the guest daily bucket (`checkAiRateLimit` for logos), the
  `/api/logo/limits` endpoint (deleted — it only existed to feed the counter), the
  logo counter + "Daily limit reached" states in the generator UI, the `logoDailyFree` /
  `logoDailyPremium` admin settings, and the `logoRequestBudgetFor` helper. Signed-in
  status now only decides whether the result is saved to logo history (history still
  needs an account + the pushed schema — that is not a credit gate, and guests get no
  history, stated honestly).
- Safety nets kept, never user-facing as credit blocks: router fallback across text
  providers, 1 retry, circuit breaker, and the admin-side daily AI spend cap + 80%
  alert (admin log only). On total provider exhaustion the user gets an honest
  "The AI service is busy right now. Please wait a minute and try again." — never a
  credit/limit message, never a fake logo. SVG sanitizer, file validation, and
  Turnstile checks are unchanged.
- Copy rewritten to the new model everywhere: pricing (Free = unlimited logo requests;
  Premium list no longer promises more logos), FAQ, Home, About, Privacy, Terms,
  Footer, account page (logo count shown without a limit), admin labels, the AI Logo
  Maker landing page, the logo-generator page, and README. Premium now means faster
  paid-GPU photo processing + HD 4x up to 4096px + face enhance + priority — NOT more
  logos, because logos are already unlimited. No invented prices; Upgrade stays hidden
  when Paddle is unconfigured.
- P0 intact: leak scan re-run — no provider/model/env names in any logo API response
  or result UI (provider names appear only in code comments); the generate response is
  `{ variants, svg }` only.
- Verified: tsc clean, eslint clean, vitest 112/112 (was 111, +1 logo-unlimited limits
  test), build EXIT=0, local `next start` checks on a fresh port (logo page 200 with
  "free and unlimited" copy and zero credit/limit strings; deleted limits endpoint
  returns the friendly 404 page; two generate calls in a row return the honest
  provider-unavailable 503 with no daily-limit wording — no provider keys exist in the
  sandbox env; pricing + FAQ pages show the unlimited logo copy). NEVER claimed
  preview-verified; merge to master still needs explicit approval.
- Owner preview checklist: generate a logo as guest → no credit message, no block →
  generate several in a row → still no block → signed-in generation saves to history
  (once the schema is pushed) → network responses leak-free.

## Fix — every config gate honest + actionable, one owner checklist (this change)

Owner complaint (2026-11-01): the sign-in page said "Sign-in is not
configured yet. The site owner needs to add the Supabase URL and anon
key (see README)" — jargon a visitor cannot act on. Audited every
config-gated dead end in the app against three rules: (a) the message
names the missing piece in plain words (never an env var name, never
a provider name), (b) a working guest/free fallback is offered
wherever one exists, (c) no dead button with no explanation.

- FIXED — sign-in page (the reported one): the message is now
  "Sign-in is not set up yet. The site owner needs to connect the
  login service before this button can work. The logo generator and
  photo enhancer still work as guest tools." The Google button is
  already hidden while unconfigured, so there is no dead button.
  Also fixed stale copy on the same page: it promised "higher daily
  limits" and a "free daily limit" — both false since logos and
  photos went free + unlimited. It now says sign-in saves logo
  history and photo jobs, and guests use both tools free and
  unlimited.
- FIXED — logo generate 503 (no AI service connected): now names
  the missing piece in plain words ("...because the AI service is
  not connected yet") instead of a bare "unavailable right now".
- FIXED — voice transcription 503: now reads "Voice transcription
  is not set up yet. Please type your prompt instead." (piece +
  fallback in one message). Note: the separate 10/day voice cap
  stays — it gates metered voice dictation, not generation, and its
  message already offers the type-instead fallback; removing it
  needs a cost decision, so it is reported, not silently dropped.
- FIXED — contact form dead end: when no contact address is
  published, a failed send used to say "try the email link below"
  with no link below. It now says "Could not send right now. Please
  try again later." And "SMTP" jargon is gone from the contact page
  and form ("an admin replies from their own email app").
- FIXED — logo footer note: "not configured" became "not connected
  yet" (plain words, same honesty).
- FIXED — four stale landing pages (coffee-shop, tech-startup,
  fitness-studio, ai-logo-maker) still said "Free tier: 10 requests
  per day". They now say unlimited requests, matching the logo fix.
- FIXED — photo enhancer Premium options: HD 4x and face enhance
  were disabled with only a "(Premium only)" label and no path to
  Premium. The advanced panel now adds one line when not Premium:
  Premium is not for sale yet because checkout is not set up, and
  everything else on the page is free and unlimited.
- ALREADY PASSING, left alone: logo history ("database needs one
  schema update... generations still work, they just are not
  saved"), account page without a database ("tools still work as
  guest tools", no buttons rendered), pricing (Upgrade hidden with
  an explicit "checkout is not configured yet" note), server
  colorize/restore (free browser path or free Enhance offered, never
  a red dead end), Turnstile (fails open when unconfigured, so it
  never gates the tools), admin two-factor/database messages
  (admin-facing, plain enough for the owner), and the logo/photo
  "temporarily disabled" messages (admin on/off switches, honest).
- NEW — SETUP.md §6: ONE consolidated owner-tap checklist covering
  every gate (sign-in login service + redirect, Vercel database
  connection, the ONE schema push with the PDF Tools Hub ownership
  rule, admin allowlist + two-factor, Paddle price/webhook, paid-GPU
  keys + model slugs, the Space, the optional contact address),
  each with the exact dashboard location for its value and what
  visitors see until it is done. SETUP.md §0 corrected to match:
  the push runs once in total across both sites, never once per
  site, and this repo never pushes. No value invented anywhere.
- Verified: tsc clean, eslint clean on all touched files, vitest
  112/112, build EXIT=0, local `next start` checks (sign-in page
  shows the new message with zero "anon key"/"Supabase URL"/"daily
  limits" strings; landing pages show unlimited requests; contact
  page has zero "SMTP"; generate returns the new 503 wording),
  Playwright public spec 9/9 (2 new gate specs), leak scan clean
  (no provider/model/env names in any changed user-facing string).
  NEVER claimed preview-verified; merge to master still needs
  explicit approval.
- Owner preview checklist: open `/signin` while unconfigured → the
  plain-words message, no button, guest tools linked → generate a
  logo as guest (works once the AI service is connected) → open
  `/pricing` → checkout note, no Upgrade button → open `/contact`
  → form + honest fallback behaviour.

## Fix — same-database dashboard wiring (LeadForge, this change)

Owner instruction (2026-11-01): LeadsForceGen's dashboard is already
on Supabase — connect AI Studio to the SAME database and make it.
Verified read-only, no new project, no new credentials:

- WIRED TO LEADFORGE IN CODE: Auth is Supabase Auth (Google
  provider) on the owner's existing LeadForge project — the same
  project LeadsForceGen uses. No Auth.js, no own Google OAuth
  client, no service-role key anywhere in the codebase (grep
  clean), no new Supabase project. Prisma reads `DATABASE_URL`
  (the Supabase pooler string, pasted by the owner into Vercel)
  and returns null when unset, so every DB feature degrades to an
  honest message instead of crashing. The Supabase Auth user pool
  is shared by design: one Google identity signs into all three
  sites, and the callback upserts the Prisma User row by
  `supabaseId` (falling back to email for pre-existing rows).
- /ACCOUNT IS THE LIVE DASHBOARD: it renders only live Prisma
  queries — profile + plan, logo requests today, Job history,
  subscriptions, payments, logo history (via the jobs API), and
  data export/delete. No demo, hardcoded, or placeholder number
  anywhere; empty states say plainly "No subscriptions yet" /
  "No payments yet" / "No jobs yet". LeadsForceGen's /dashboard
  is a lead-search tool, not an account overview, so it is not a
  template to mirror — duplicating it would be the wrong page.
- NEW — Photo jobs section on /account (the gap this phase
  found): photo jobs live only in PhotoJob, never in Job, so they
  never appeared on the dashboard. They now do: mode, status, date
  (latest 20), each linking to `/photo-enhancer?job=<id>` to resume.
  A missing PhotoJob table degrades to an honest schema note, not
  a broken section.
- FIXED — label accuracy: "Logos generated today" became "Logo
  requests today", because the count logs every logo Job row
  including failed attempts. Requests is what it counts.
- FIXED — missing-table robustness: the account page's main
  queries now catch a missing-table error and render the honest
  schema-update message ("the database needs one schema update...
  the tools still work as guest tools") instead of a 500. Logo
  history already did this via its API's 503.
- NEW — /dashboard route: it redirects to /account (same auth
  chain: logged out → /signin) rather than duplicating the page,
  so the URL the owner expects works and cannot drift. It is
  deliberately not in the sitemap (account pages never are).
- SCHEMA VERDICT (read-only diff vs PDF Tools Hub, confirmed by
  the sibling agent's independent report): the schemas are
  DATABASE-COMPATIBLE — all 20 shared models have identical
  scalar columns, so one push creates the same tables. Drift is
  non-breaking but real: (1) ai-studio-only tables LogoGeneration,
  AiUsageLog, PhotoJob (the sister client never touches them);
  (2) PDF Hub's Job/AuditLog/ErrorLog carry extra indexes
  ai-studio lacks; (3) AdminNote relation names differ
  ("NoteTarget"/"NoteAuthor" vs "UserNotes") — client-level only,
  same columns. Consequence: THE SINGLE PUSH MUST COME FROM
  AI-STUDIO'S SUPERSET SCHEMA, once — a push from PDF Hub would
  create the shared tables but NOT the three ai-studio tables,
  and must never run afterward (it would treat them as removed).
  This repo's schema header comment now names all three
  ai-studio-only tables (it previously named only LogoGeneration).
- PUSH STATUS: NOT RUN, and deliberately so — no DATABASE_URL is
  present locally (only `.env.example` placeholders; process env
  has none), so nothing was invented. The single push is the
  owner's tap, once, from his machine, using THIS repo's schema
  with the pooler connection string (SETUP.md §6 step 3). This
  agent never pushes; PDF Hub never pushes afterward.
- Verified: tsc clean, eslint clean on touched files, vitest
  112/112, build EXIT=0 (includes /dashboard), local `next start`
  checks (/dashboard 307 → /account → /signin when logged out,
  home 200), Playwright public spec 9/9 (dashboard redirect
  assertion added), leak scan clean. NEVER claimed
  preview-verified; merge to master still needs explicit approval.
- Owner preview checklist: sign in (once env + redirect +
  redeploy + push are done) → /account shows your real plan,
  logo requests, logo history, photo jobs, subscriptions,
  payments → /dashboard lands on the same page → with the schema
  unpushed, /account shows the honest schema message, never a
  500 or a fake number.

## Fix — one admin identity, full admin panel, professional redesign (this change)

Owner brief (2026-11-01): one admin login across all sites, a full
admin panel controlling the whole shared database, and a professional
redesign (not vibe-coded), following ui-ux-pro-max + frontend-design.

### 1. One admin identity (same on every site)

- Google sign-in stays primary. ADDED email + password sign-in as an
  option (`app/signin/PasswordSignIn.tsx`, Supabase Auth
  `signInWithPassword`, alongside the Google button). There is no
  self-service password signup: accounts are created ONLY by the
  owner in the Supabase dashboard (Authentication → Add user) with a
  fresh password never shared in chat, and the Email provider must be
  enabled there by him (SETUP.md §6 step 4 covers both taps). No
  password from chat history was used, stored, or put in any file —
  the previously pasted password is burned and stays burned.
- Errors are deliberately generic ("Invalid email or password, or
  this account is not set up for password sign-in yet") so the form
  never reveals which accounts exist, whether an email is confirmed,
  or whether an account only has Google sign-in.
- The same admin email identity works across all sites via the
  `ADMIN_EMAILS` allowlist (env-driven, never hardcoded): the first
  allowlisted login becomes ADMIN + SUPER automatically, or a SUPER
  grants the role on `/admin/users`. TOTP 2FA stays MANDATORY for
  `/admin` on every route, whichever way the admin signed in —
  enforced server-side by `requireAdminPage` (pages) and
  `requireAdmin` (API routes, fail-closed when no TOTP secret is
  set). Admin role gating is server-side on every admin API route
  (verified live: PATCH without a session returns 403 Forbidden).
- The sign-in page no longer says "Only Google sign-in is offered":
  it describes Google as primary and email + password for
  owner-created accounts. When sign-in is unconfigured, neither the
  Google button nor the password form renders — only the plain-words
  message (Playwright asserts both).

### 2. Full admin panel (what was missing, added; what existed, kept)

- NEW — `/admin/database`: read-only overview of the whole shared
  database — live row counts + 5 latest rows for all 18 tables
  (User, LogoGeneration, PhotoJob, Job, AiUsageLog, Subscription,
  Payment, AuditLog, AdminNote, SupportMessage, Expense, BlockedIp,
  SiteSetting, WebhookEvent, ErrorLog, plus the 3 legacy Auth.js
  tables as counts only). No SQL console, no edits, no deletes, no
  bulk action. Sensitive columns are NEVER selected: no TOTP
  secrets, no legacy tokens, no base64 photo data, no logo SVG
  blobs, no Paddle customer/subscription ids (verified by grep).
  A table whose schema is not pushed yet shows an honest "schema
  push pending" note instead of breaking the page. Linked in the
  admin nav. Provider names appear here only because this is the
  owner's own panel — the P0 rule still bans them from user-facing
  UI, and this page is admin-only.
- NEW — admin role management: `/api/admin/users/[id]` PATCH now
  accepts `role` (USER/ADMIN) + `adminRole` (SUPER/SUPPORT/FINANCE),
  SUPER-only, with guards: no changing your own role (no
  self-demotion lockout), an admin role requires role ADMIN, and
  dropping to USER forcibly clears any stale admin role. Every
  change is audit-logged with an accurate action name. The user
  detail page gains a Role + Admin role form (SUPER only) and states
  that new accounts are created in the Supabase dashboard, never here.
- NEW — overview counts completed: `/admin` now also shows logo
  generations (all time), photo jobs (all time), and revenue total
  (same definition as the Money page — sum of all payment rows — so
  the two pages never disagree; refund rows are listed separately
  on Money). Existing live counts kept: users, new today/week/month,
  active week, failed jobs, errors, AI cost vs budget.
- NEW — audit gap closed: TOTP enrollment (`/api/admin/setup-2fa`
  POST) now writes an audit row (`2fa.setup`). Audit coverage
  re-verified: every admin mutation route audits; the only
  unaudited routes are read-only GETs (ai-health) and the 2FA status
  check.
- KEPT (already met the brief, verified not assumed): Users search +
  plan/status filters + suspend/unsuspend + plan change + notes;
  Money (Paddle orders, revenue today/week/month/total, expenses,
  refunds, CSV export); Tokens & providers (`/admin/ai-health`:
  per-provider calls, success rate, key-present booleans only —
  never values — toggle state, spend today, daily cap) + Settings
  kill-switches per provider + spend caps; Site settings; Activity
  log (`/admin/logs` shows every admin action).
- NOT BUILT, honestly reported: there is NO manual-payment-proof
  approve/reject queue in AI Studio because no manual payment flow
  exists here (Paddle only; payouts are manual expense records).
  Building a proof queue would invent a flow the site does not
  have. If the owner wants manual payments on AI Studio later,
  that is a new feature with its own brief.

### 3. Professional redesign (systematized, not rebranded)

- The ui-ux-pro-max design-system search ran (AI-Native UI,
  purple/pink, Space Grotesk/DM Sans). Deliberately NOT applied as
  a rebrand: the site already has a shipped identity (pink/cream +
  cyan accent + Playfair Display italic + 2px borders), and a
  purple rebrand would break recognition, OG images, and logo
  examples for no user benefit. The skill's structural rules were
  applied instead (accessibility first, 44px targets, mobile-first,
  no layout shift, semantic tokens).
- NEW — `DESIGN_SYSTEM.md`: the single source of truth — all tokens
  (from `app/globals.css` `@theme`), the 11 rules (16px/1.5 type,
  44px targets, 3px cyan focus outline, reduced-motion respected,
  max-widths, border-2 cards with no shadows, SVG icons only,
  labelled forms with near-field errors, plain-words copy, honesty
  rules, no layout shift). Audit found the system already followed
  in code: zero raw hex in any component.
- FIXED — one real contrast failure: the pricing page's tool link
  used `text-brand` (#EC4899 on white, ~3:1) — now `text-brand-dark`
  (passes 4.5:1). No other small-text use of `text-brand` exists.
- KEPT INTACT: every URL works (no URL changed; `/dashboard`
  redirect from the previous phase untouched), honest labels, leak
  rules, free-unlimited photo model, logo unlimited, 5/min limiter,
  security headers.
- Verified: tsc clean, eslint clean on all touched files, vitest
  112/112, build EXIT=0 (includes `/admin/database`), local
  `next start` checks (`/admin/database` logged out → 307 to
  `/signin?next=...`; users PATCH without session → 403; `/signin`
  unconfigured shows only the plain-words message), dev-server
  check with placeholder Supabase env (both Google button and
  password form render), Playwright public 9/9 + a11y-mobile 6/6
  (360px no overflow on Home, both tools, landing page; keyboard
  reaches the tool CTAs; landing CTA keyboard-reachable), leak
  scan clean. NEVER claimed preview-verified; merge to master
  still needs explicit approval.
- Owner preview checklist: `/signin` (once configured) shows Google
  + email/password options → sign in with the dashboard-created
  admin account → `/admin` shows the new generations/photo-jobs/
  revenue cards → `/admin/database` shows live counts + recent
  rows, no secrets → `/admin/users/<any>` → change a test user's
  role (not your own) → `/admin/setup-2fa` still works and the
  action appears in `/admin/logs`.

## Fix — large-photo upload failures, honest errors, colorize fallback, Admin link (this change)

- ROOT CAUSE (proven live): a 12 MB upload died with HTTP 413
  plain-text (serverless request limit ~4.5 MB vs the tool's 10 MB
  promise). The client JSON-parsed the plain-text body, the parse
  threw, and the fallback was the bare generic failure. Phone photos
  routinely land between 4.5 MB and 10 MB, so this hit real photos.
- CLIENT-SIDE PRE-UPLOAD COMPRESSION (`lib/browser/compress-image.ts`,
  used by Enhance and server colorize): a file over ~4 MB is shrunk
  in the browser (canvas, stepwise smaller dimensions + lower JPEG
  quality) until the upload blob is under 4 MB, then that blob is
  uploaded. Photos under 4 MB upload untouched. The UI says photos
  over about 4 MB are compressed before upload, and shows one honest
  note when a photo actually was compressed; the original file on the
  device is never modified. The server's 10 MB check stays as a
  backstop. The sizing loop is pure and unit-tested
  (`tests/compress-image.test.ts`); the canvas path itself is covered
  by the owner preview check with a real large phone photo.
- HONEST ERRORS (no provider/model/setting names anywhere): 413 →
  "That photo is too large to upload. Try a smaller photo, or let
  the tool compress it and try again."; timeout/network → "The
  connection broke before the result came back. Check your
  connection and try again."; JSON server errors keep the server's
  own message. The old bare generic failure string is gone.
- MODE LABELS (plain words, no fake HD/colour claims): Enhance =
  sharper and cleaner, same colours; Colorize = black-and-white →
  colour; Restore + Colorize = repair + colour. A grayscale photo in
  Enhance mode still nudges toward Colorize (hint, never a block;
  "Colorize anyway" override unchanged). Free routing unchanged:
  free stays Sharp standard + free browser colorize; HD 4x + face
  enhance stay Premium GPU (needs the owner's keys, never invented).
- OUTPUT-SIZE GUARD (`lib/ai/output-format.ts`, Enhance route only):
  a PNG output over ~8 MB is served as JPEG instead (a noisy 3.1 MB
  input once produced a 37 MB PNG). The client now names the
  download from the real content type. Small outputs untouched;
  conversion failure falls back to the original buffer.
- COLORIZE FALLBACK (no dead ends, never a fake tint): server
  colorize failure with a browser alternative now offers the free
  browser colorize button, and auto-offers it for a too-large upload
  too (browser colorize uploads nothing). Browser colorize failure
  now offers server colorize as a button when the server is
  available, otherwise free Enhance. When the server says "try
  browser colorize" but the device cannot run it, the message says
  so honestly and offers Enhance instead. Free users' primary
  Colorize button was already the browser path; the browser model
  itself (~64 MB, downloaded once and cached) could not be run in
  the sandbox, so a real B&W photo check on the preview is required
  (see SETUP.md §7).
- ADMIN DISCOVERABILITY (gates unchanged): a visible "Admin" link
  is now in the site footer (all visitors) and in the signed-in
  header navigation. Link visibility is NOT access: /admin pages
  and APIs still enforce admin role + fresh TOTP server-side,
  fail-closed, exactly as before.
- Verified: tsc clean, eslint clean on touched files, vitest
  123/123 (11 new: compression sizing loop + output guard), build
  EXIT=0, local `next start` checks (home 200 with footer Admin
  link, /photo-enhancer 200, small upload POST /api/enhance 200),
  Playwright public 9/9 + a11y-mobile 6/6 against the fresh local
  build, leak scan clean. NEVER claimed preview-verified; merge to
  master still needs explicit approval.
- Owner preview checklist: see SETUP.md §7.
