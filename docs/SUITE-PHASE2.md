# AI Studio Suite — Phase 2: Audio-Clean Editor

## 0. Audit (written before building; verified against the tree at 0f371f5)

### Existing audio machinery — nothing here cleans audio

- **Voice-to-prompt transcription** (`app/api/logo/transcribe/route.ts`): a
  short voice memo is sent to Groq Whisper (the one verified STT provider)
  and returns plain text for the logo prompt. Same abuse bar as logo
  generation (Turnstile + per-IP STT bucket, 10/day, 10 MB cap, audio MIME
  allowlist). Audio is sent for transcription only and is not stored.
  This is NOT cleaning, NOT editing, and NOT reusable for it — no
  processing, no output file, no job record beyond the STT bucket.
- **ElevenLabs** (`lib/ai/adapters/elevenlabs.ts`, routed via
  `lib/ai/router.ts`): text-to-speech only (voiceover). No input-audio
  processing of any kind.
- **No audio upload handling** anywhere else, no audio editor page, no
  audio job table, no Web Audio code (`AudioContext` /
  `OfflineAudioContext` appear nowhere in `app/`, `lib/`, `components/`).
- **Browser-first precedent** (`lib/browser/compress-image.ts` +
  `tests/compress-image.test.ts`): pure functions on bytes/pixels, tested
  in vitest, with the heavy browser APIs kept at the thin edge. Phase 2
  follows the same shape: pure sample-array transforms in
  `lib/browser/audio-clean.ts`, browser `decodeAudioData` only for
  decoding, pure-JS WAV encoding for output.

### Phase 1 seams this phase uses (no new ones invented)

- **Job records — existing `Job` model, no schema change.** `Job` has
  `userId` (nullable), `tool`, `status` (`SUCCESS`/`FAILED`),
  `inputSummary`, `errorCode`, `costEstimate`, `createdAt`. `logJob` in
  `lib/settings.ts` writes one row and never throws (logging must never
  break a tool response). `/account` already lists `Job` rows generically
  (tool / status / date, last 50, session-user-only) — so an
  `audio-clean` row appears in the per-user panel with zero panel code
  changes. Admin user detail already shows jobs status-only. **No new
  column, no new model, no schema push needed for this phase.**
- **Quota — the free path, honestly.** Free photo/logo routes are
  UNLIMITED by owner decision (`lib/limits.ts`); the only budget in the
  system is the Premium paid-GPU budget (`checkPhotoCredits`, photo-only).
  Audio cleaning runs 100% in the browser, costs the service nothing,
  and makes no paid call — so it rides the free path exactly like the
  free photo routes: no daily cap, no credit charge, no "will use N
  credits" copy. The one guard that DOES apply is the abuse bar: the
  5-requests-per-minute per-IP limiter (`checkMinuteRateLimit`) on the
  job-record route. `checkPhotoCredits` is deliberately NOT touched —
  it is photo-only, and audio-clean has no GPU cost to check against.
- **Auth/session model (unchanged).** `getSessionSafe` (`lib/auth.ts`)
  returns null when Supabase env is unset, so tools keep working as
  guests where they allow it. This editor does NOT allow guests: the
  page redirects to `/signin` with no session (same pattern as
  `/account`), because job records are per-user by design. Suspended
  accounts see a notice, not the tool (same pattern as `/account`).
  The age-onboarding gate is intentionally NOT applied here: it gates
  `/account` features, and no tool page applies it.
- **Gating layers (unchanged).** `proxy.ts` requires a session for
  `/account` and `/admin` only — it does NOT cover `/audio-cleaner`,
  so the page itself enforces the redirect. The page redirect preserves
  the destination via the validated `?next=` param (`safeRedirectPath`
  in `lib/redirect.ts`), so sign-in returns the user to the editor.
- **Audit events.** User-affecting admin actions already audit via
  `auditAdmin`; audio-clean needs no new admin action, so no new audit
  event is invented. Admin visibility is the existing status-only job
  oversight — never file bytes (and no file bytes ever reach the
  server at all: processing is in-browser, only a status row is posted).

### Browser audio APIs available in this stack

- `AudioContext.decodeAudioData` (Chromium/Firefox/Safari): decodes
  audio/* and video containers the browser supports (mp4/webm/mov) to
  PCM. For a video file input, this extracts the audio track only —
  the video is discarded, no re-encode happens, output is audio-only
  (WAV). That is exactly the brief's "audio of a video file, audio-only
  processing" scope.
- `OfflineAudioContext` exists in browsers but is NOT needed: the
  transforms are pure sample math, so the pipeline is
  decode → pure transforms → WAV encode. This keeps the processing
  fully unit-testable in node (vitest) and leaves only decoding as a
  browser-only step, proven in Playwright with a generated tone.
- No new dependency: no audio library, no paid provider, no server
  processing. `zod` (already a dependency) validates the job-record
  route body; `typescript` (already a dependency) transpiles the
  pipeline module for the Playwright browser spec (see §3).

### What the editor must NOT claim (honesty rules for this phase)

- A noise gate quiets background sound BETWEEN speech. It does NOT
  remove noise under speech, it is NOT AI denoising, and it is NOT a
  "remove background noise completely" promise. Copy says "noise gate",
  never "AI noise removal".
- Cleaning improves sound quality only. It does NOT remove copyright,
  does NOT make a recording yours, and does NOT promise
  "copyright-free" output. Banned copy: "copyright removed",
  "copyright-free", "no copyright strikes" (same ban as the clipper).
- Normalize sets peak level; it does not restore clipped/distorted
  audio and does not claim loudness-standard compliance (no LUFS
  metering in this phase — peak normalize only, stated plainly).
- Every control on the page does something real. No placeholder
  sliders, no "AI enhance" button that runs nothing.

## 1. What was built (Phase 2 — audio-clean editor)

### Pipeline: `lib/browser/audio-clean.ts` (dependency-free, pure)

- `dbToGain` / `gainToDb` helpers.
- `applyNoiseGate(samples, thresholdDb, sampleRate, attackMs,
  releaseMs)`: envelope follower with attack/release smoothing, so
  gating does not click. Quiet samples are attenuated toward silence;
  loud samples pass untouched. Inputs are never mutated (copies out).
- `normalizePeak(samples, targetDb)`: scales so the peak hits the
  target; silence (peak 0) passes through unchanged; returns the
  applied gain in dB for the stats line.
- `trimSamples(samples, sampleRate, startSec, endSec)`: clamped to the
  buffer; throws on an empty/inverted range (the UI validates first
  and shows the message — the throw is the backstop, pinned by test).
- `encodeWav(channels, sampleRate)`: 16-bit PCM WAV, interleaved,
  standard RIFF header. No encoder dependency.
- `cleanAudioChannels(channels, sampleRate, settings)`: composes
  trim → gate → normalize in that order (trim first so discarded
  audio is never processed; gate before normalize so the noise floor
  is not boosted by the level step). Returns cleaned channels plus
  honest stats: peak before/after in dB, gate threshold (or off),
  trimmed range, output format. The module imports nothing and uses
  only `export function` / `export const` declarations, so the
  Playwright spec can transpile it from source and run the REAL
  pipeline in Chromium (see §3).

### Editor page: `/audio-cleaner`

- Server page: no session → redirect to `/signin?next=/audio-cleaner`
  (validated destination); suspended account → notice, no tool.
  Signed-in active users get the tool. No age gate (see audit).
- `AudioCleanerTool` (client): file input (audio/* + video/mp4, webm,
  mov for audio extraction; 10 MB cap, same as the transcribe/photo
  caps); decode via `decodeAudioData`; controls — noise gate on/off +
  threshold slider (-60…-20 dB, default -45), normalize on/off
  (default on, peak target -1 dB, fixed — no fake precision slider),
  trim start/end in seconds (validated against duration); Clean
  button; before/after `<audio>` previews (original file URL vs
  cleaned WAV blob URL); stats line (peak before/after, gate, trim,
  output WAV 16-bit); download link (`cleaned-<name>.wav`).
- Video-file note on the page: only the audio is cleaned; the video
  is discarded and the download is audio-only (WAV). No video
  re-encode in this phase, as briefed.
- Honesty sentence on the page (standing suite sentence, same ban as
  Phase 1): cleaning improves sound quality — it does not remove
  copyright, does not make a recording yours, and does not promise
  copyright-free output. The gate copy says "noise gate", never "AI
  noise removal".
- Job recording: after a clean succeeds or fails, the client POSTs
  `/api/audio-clean/jobs` with status + a summary
  (`audio-clean <duration>s <channels>ch <sampleRate>Hz -> wav`) and
  an error code on failure. No filename (privacy), no file bytes, ever.
  A record failure never blocks the preview or download (fire-and-
  forget, mirroring `logJob`'s never-break-the-tool rule).

### Job-record route: `POST /api/audio-clean/jobs`

- Auth first (401 without session, 403 when suspended — a logged-out
  caller learns nothing about validation from the error shape, same
  order as the Phase 1 credits API). Then the 5/min per-IP limiter
  (`checkMinuteRateLimit`, Upstash when configured, in-memory
  fallback otherwise). Then zod validation
  (`status` SUCCESS|FAILED, `inputSummary` ≤200 chars, `errorCode`
  ≤64 chars). Then `logJob` with `tool: "audio-clean"` and
  `costEstimate: 0`. Returns `{ ok: true }`. Accepts JSON only — it
  cannot receive file bytes by construction.
- Quota note: this route charges nothing and checks no GPU budget,
  because browser processing costs nothing. The limiter is abuse
  protection, not a usage cap (same distinction as the photo tools).

### Discovery (same lists the other tools use)

- Header nav (`components/site/Header.tsx`), footer tools list
  (`components/site/Footer.tsx`), and the homepage tools array
  (`app/page.tsx`) each gained one "Audio Cleaner" entry with honest
  copy (noise gate, trim, normalize, WAV download; sign-in required
  for job history is stated on the editor page, not hidden).

## 2. Panel map (additive — nothing else moved)

| Who | Editor | Panel shows |
|-----|--------|-------------|
| Signed-out visitor | redirected to `/signin?next=/audio-cleaner` | nothing (no panel UI, no tool) |
| Signed-in user | full editor | own `audio-clean` rows in `/account` Job history (tool / status / date), like logo rows |
| Admin (any role) | n/a (admin gate unchanged) | job rows status-only on user detail, as before — never file bytes |
| Suspended user | notice, no tool | suspended notice, as on `/account` |

## 3. Verification approach (why the specs look the way they do)

- **Vitest** (`tests/audio-clean.test.ts`): pure pipeline with
  generated tones — no fixtures, no real audio, no copyrighted
  material. Gate (quiet → attenuated, loud → untouched, no input
  mutation), normalize (peak → target, silence unchanged, gain
  reported), trim (clamp + throw on inverted range), WAV encode
  (RIFF header + sample round-trip via DataView), full composition
  (trim → gate → normalize order + stats). Route tests: logged-out
  POST → 401 (Supabase env unset → `getSessionSafe` null), bad body
  logged-out → 401 (auth runs before validation).
- **Playwright** (`tests/e2e/suite-phase2.spec.ts`): e2e runs
  credential-free, so signed-in flows cannot be driven through the
  gated page (same limitation Phase 1 documented for panel flows).
  The specs therefore prove what credential-free CAN prove, and say
  so in their header: (a) `/audio-cleaner` redirects signed-out to
  `/signin`; (b) the job-record API returns 401 logged-out (and 401
  before validation); (c) the REAL pipeline runs in a REAL Chromium
  page — the spec reads `lib/browser/audio-clean.ts` from disk,
  transpiles it with the repo's own `typescript`, strips the `export`
  keywords, and drives it in `page.evaluate` with a generated tone
  (sine + quiet noise): decode the encoded WAV via `decodeAudioData`,
  clean with gate + normalize + trim, and assert duration, peak,
  noise attenuation, and a valid WAV header. No test route is shipped
  to production for this, and no fixture is downloaded.
- **NOT proven by specs (live QA, see §5):** the signed-in full flow
  (upload → clean → preview → download in the real UI) and the panel
  job-row visibility for a signed-in user. Both are proven by code
  scoping (page gate, `logJob` tool value, `/account` generic Job
  listing) and owed as live checks with a real session.

## 4. Verification results (before commit, tree at 0f371f5 + this phase)

- vitest: 200/200 across 32 files (189 pre-existing + 11 new
  audio-clean tests).
- tsc: 0 errors. next build: 0 (routes `/audio-cleaner` and
  `/api/audio-clean/jobs` listed).
- eslint: 0 on changed files; repo-wide exactly the Phase 1 baseline
  (4 problems: 3 errors, 1 warning, all pre-existing in untouched
  files — ThemeToggle, TurnstileWidget, ai/types, svg-sanitize).
  One real fix during the run: an unused eslint-disable in the new
  spec was removed so the baseline did not grow.
- Playwright: 32/32 (28 pre-existing + 4 new Phase 2 specs). One
  full-suite run showed a 30s timeout on the a11y-mobile
  /logo-generator check; rerun in isolation passed 6/6 — dev-server
  slowness under full-suite load, not a regression (the desktop nav
  is `hidden` below `lg`, so the new header link cannot overflow a
  360px viewport; the failing call was a timeout, not an overflow
  assertion).
- Two real finds fixed during the run: (1) the spec's in-page driver
  carried a TypeScript annotation into plain-JS `new Function`
  (SyntaxError) — annotation removed; (2) `transpileModule` with
  `module: None` still emits CommonJS `exports` references — the spec
  now uses `module: ESNext` and strips `export` prefixes, verified in
  node before rerunning.
- Downloader-term grep: no downloader exists in this phase (no link
  input, no fetch of remote media). Banned-copy grep on new UI copy:
  "copyright removed", "copyright-free", "no copyright strikes" are
  absent; the honesty sentence is present on the editor page.
- No schema change, no env change, no stash in this repo (none
  existed). Push = auto-deploy; live probes owed after (see §5).

## 5. QA checklist (for the parent's live probe + the owner's hands)

- [ ] Live: `/audio-cleaner` redirects logged-out to
  `/signin?next=/audio-cleaner`; `/account` and `/admin` gates
  unchanged (see Phase 1 probe).
- [ ] Live (signed-in): upload an audio file → set gate + trim →
  Clean → before/after previews play → download gives a playable WAV
  with quieter gaps and normalized peak; the job appears in
  `/account` Job history as `audio-clean` / SUCCESS.
- [ ] Live (signed-in): upload a video file → cleaned download is
  audio-only WAV; the page note says so before cleaning.
- [ ] Live (signed-in): a failed clean (e.g. corrupt file) shows an
  honest error and records a FAILED job row with an error code.
- [ ] Live: suspended account sees the notice, not the tool.
- [ ] Owner taps still owed (unchanged by this phase): DATABASE_URL +
  per-site TOTP secrets + redeploy for live login; schema push once
  from this repo for Phase 1 adjustments + audit reasons (this phase
  needs NO schema change — `Job` already exists).
- [ ] NOT in this phase (later, one by one): photo-to-motion editor
  (PAID video generation — needs spend approval + Premium gating),
  video-enhance editor (heaviest, Premium only, spend approval).
- [ ] Out of every editor phase: clipper pipeline duplication,
  downloaders, copyright promises, invented tracks/licences, bulk
  without quotas, paid calls without spend approval.
