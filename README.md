# AI Studio

Free AI tools: an original logo generator and a photo enhancer. Next.js App Router +
TypeScript + Tailwind CSS v4, with hand-rolled shadcn-style components in `components/ui`.

## Update 2026-11-01 — logo quality + history release

- Logo generation now returns 3 variants per request (primary model `openai/gpt-oss-120b`,
  fallback `openai/gpt-oss-20b`; `llama-3.3-70b-versatile` is retired and never used).
  Model choice was live-tested 2026-11-01 (see `tests/logo.test.ts` + the model test log):
  120b produced a valid brand-text SVG in ~2.3s, 20b in ~2.4s; 120b wins on quality.
- The SVG sanitizer now allows brand-name `<text>` (safe attributes only, text nodes
  length-capped and entity-escaped); scripts, handlers, and external references are still stripped.
- New: example gallery, suggested prompts, live daily counter (`GET /api/logo/limits`),
  mockup preview, saved logo history (`LogoGeneration` table + `/api/account/jobs`),
  `/pricing`, `/faq`, 3 use-case pages, OG image `public/og.jpg` (32 KB JPEG).
- Streaming (SSE) was NOT implemented: server-side SVG validation needs the complete model
  output before anything is shown, so the UI uses staged progress states with a ~10s estimate instead.
- Tests: vitest 30/30, Playwright 13/13, `npm run build` EXIT=0 (2026-11-01).
- Owner taps still owed: one `prisma db push` from this repo (creates `LogoGeneration`);
  optional `REPLICATE_API_TOKEN` for AI upscaling; no Vercel env var was touched.

## Routes

| Route | What it does |
| --- | --- |
| `/` | Home: hero, tool cards, how-it-works, FAQ, trust, premium, other projects |
| `/logo-generator` | AI logo generator: 9 example logos, suggested prompts, brand-name input, 3 variants per request, per-variant Regenerate / SVG / PNG 1024 / Copy SVG, mockup preview (card, shirt, app icon), live daily counter |
| `/photo-enhancer` | Photo enhancer (drag-and-drop, real upload progress, before/after slider, PNG + JPG download) |
| `/pricing`, `/faq` | Pricing (Free 10/day vs Premium 100/day, Paddle checkout, price shown at checkout) and FAQ |
| `/logo-for-coffee-shop`, `/logo-for-tech-startup`, `/logo-for-fitness-studio` | Original use-case pages with JSON-LD |
| `/about`, `/contact`, `/privacy`, `/terms`, `/disclaimer` | Content and policy pages |
| `/cookies`, `/refund-policy`, `/acceptable-use`, `/dmca` | Cookie, refund, moderation and takedown pages |
| `/signin`, `/onboarding`, `/account` | Google sign-in, age confirmation, profile + usage + job history + data export/delete |
| `/admin` (+ users, money, usage, settings, support, logs, setup-2fa, verify-2fa) | Admin panel: Google login + allowlist + mandatory TOTP 2FA, roles SUPER/SUPPORT/FINANCE |

## API routes

| Route | Behaviour |
| --- | --- |
| `POST /api/logo/generate` | Zod-validated `{prompt (≤300), style, colors, brandName (≤40)}`. Strict designer prompt (one SVG, 512 canvas, transparent background, ≤8 shapes, ≤3 palette colours, brand name in bold sans-serif `<text>`). Groq `openai/gpt-oss-120b` primary + `openai/gpt-oss-20b` fallback; 3 variants in parallel, fallback round fills missing slots. Output is whitelist-sanitized server-side (`<text>` allowed, safe attrs only) and validated before return. Brand/celebrity prompts refused (400, pre-check blocklist + model `REFUSED` handling). Groq 429 → honest 429, never a fake logo. Without `GROQ_API_KEY` returns an honest 503. One request = 1 quota unit = 3 variants; signed-in quotas from SiteSetting via Job rows, guests 10/day per IP. Signed-in successes also save a `LogoGeneration` row (history). |
| `GET /api/logo/limits` | Free-tier counter: signed-in exact counts from the DB; guest in-memory peek (null remaining under Upstash, where peeking is impossible without consuming). |
| `GET/DELETE /api/account/jobs`, `PATCH/DELETE /api/account/jobs/[id]` | Own-user-only saved-logo history: list, favorite toggle, delete one, delete all. Returns an honest 503 (not fake-empty) until the schema push creates the table. |
| `POST /api/logo/png` | Sanitizes the supplied SVG again, rasterizes with Sharp at 1024px, transparent background. |
| `POST /api/enhance` | Multipart image, magic-byte validated JPG/PNG/WebP, max 10 MB. Replicate `nightmareai/real-esrgan` when `REPLICATE_API_TOKEN` is set and succeeds (labelled `ai`); otherwise Sharp 2x lanczos3 + sharpen + normalize (labelled `sharp`, never claimed as AI). Replicate output URLs are fetched only from `replicate.delivery` (SSRF allowlist). |
| `POST /api/checkout` | Auth + age-18+ required. Creates a Paddle hosted-checkout transaction and returns its URL. No card data touches this site. |
| `POST /api/webhooks/paddle` | Verifies the signature with the Paddle SDK, idempotent via `WebhookEvent.eventId` (duplicate → 200 ignored). Handles `transaction.completed` + `subscription.created/updated/cancelled` → upserts Subscription/Payment and sets `User.plan`. Customer mapping is keyed on the Supabase user id/email first (Prisma id as legacy fallback). |
| `GET /api/account/export`, `POST /api/account/delete` | The caller's own data only (id from session, never from params). Export omits the TOTP secret. |
| `POST /api/contact` | Stores contact-form messages in the admin support inbox (when the DB is configured). No SMTP is configured: replies are recorded in the DB and sent via mailto. |
| `/api/admin/*` | Admin mutations, each enforcing role + TOTP server-side (defense in depth behind the session proxy). Every admin action writes an AuditLog row. |

## Honest launch states

- **No Groq key** → logo generation returns 503 and the page shows that message. No fake logo.
- **No Replicate token (or Replicate failure)** → enhancer uses Sharp and the UI clearly says
  “Enhanced (standard quality — set REPLICATE_API_TOKEN for AI upscaling)”.
- **No Turnstile keys** → tools work without captcha. Set both keys to enable bot protection.
- **No Upstash keys** → in-memory per-IP rate limiting (10/day per AI tool). It does not persist
  across serverless instances; set Upstash keys for a distributed limiter.
- **No Supabase env vars** → the sign-in button is replaced by an honest “not configured” message and `/auth/callback` redirects to `/signin`; tools still work as guests and the build still passes.
- **No Paddle env vars** → checkout returns an honest “not configured” error and renders no
  actionable payment button. No payment details are collected anywhere on this site.
- **No AdSense publisher ID** → the ad slot renders nothing. Never enable ads before approval.
- **No contact email** → the contact page shows “contact email not configured yet” and disables the button.

## Environment variables

See `.env.example` for the full list with placeholders only. Never remove or
overwrite existing Vercel env vars (notably the already-set `GROQ_API_KEY`);
all new values below are owner steps — do not create empty/placeholder env
vars in Vercel.

- `GROQ_API_KEY` (server-only, required for AI logos)
- `REPLICATE_API_TOKEN` (server-only, optional — enables AI upscaling)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (optional — distributed rate limiting)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (optional — bot protection)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (existing Supabase project “LeadForge”, Google provider already configured there — do NOT create a new Google Cloud OAuth client; `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `AUTH_SECRET` belonged to the removed Auth.js setup and must not be added)
- `DATABASE_URL` (Supabase Postgres pooler string, shared with PDF Tools Hub — same value in both sites' Vercel projects; schema pushed ONCE from either repo)
- `TOTP_SECRET` (per-site server-only secret — MUST DIFFER between sites; rotating it requires TOTP re-enrollment, since TOTP secrets are encrypted with a key derived from it. There is deliberately NO `SUPABASE_SERVICE_ROLE_KEY`: the anon key covers every app path)
- `ADMIN_EMAILS` (comma-separated allowlist; first login with an allowlisted email becomes ADMIN + SUPER; no passwords, no fallback login, ever)
- `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_ID`, `PADDLE_ENV` (`sandbox` first, `production` only after sandbox testing)
- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SISTER_SITE_URL` (default `https://pdf-tools-hub.vercel.app`),
  `NEXT_PUBLIC_LEADSFORCEGEN_URL` (default `https://leadsforcegen.vercel.app`),
  `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_PREMIUM_CHECKOUT_URL` (legacy; checkout now goes through Paddle),
  `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` (all optional/public)

## Architecture: auth, shared DB, SSO limit

- Auth: Supabase Auth, Google-only, on the owner's EXISTING Supabase
  project "LeadForge" (ref omnqidmauvloedscncir) — its already-configured
  Google provider is reused; no new Google Cloud OAuth client exists.
  Sessions are Supabase cookies, refreshed by `proxy.ts` (the Next.js 16
  convention; `middleware.ts` is deprecated in 16.4). The proxy NEVER
  touches Prisma: it only enforces "signed in" for /admin, /account and
  /onboarding. Roles, suspension, age confirmation and TOTP live in
  Prisma and are enforced server-side by lib/admin-page.ts,
  lib/admin-guard.ts and app/account/page.tsx on every request.
  First login upserts the Prisma User row by `supabaseId`, then email;
  the schema change for this rework is ONLY that one nullable unique
  column. Sign-in goes through the site's own /auth/callback route,
  which exchanges the code and validates `next` (relative paths only —
  no open redirect). TOTP: the existing custom implementation is KEPT
  (see Security section) — Supabase MFA was not adopted because it
  would add a second, parallel second-factor store and enrolment flow
  for admins who already have the working TOTP path, with no security
  gain for a single-admin panel.
- Shared database: the same Supabase Postgres project, `DATABASE_URL`
  (pooler string) pasted into both AI Studio and PDF Tools Hub.
  `prisma/schema.prisma` MUST stay database-compatible in both sites
  (the legacy Auth.js Account/Session/VerificationToken tables are
  retained unused for parity — do not drop them). Build runs
  `prisma generate` and succeeds with `DATABASE_URL` unset; without a
  DB the site runs guest-only (tools keep working, auth/admin show
  "not configured").
- SSO limit (honest): true one-login SSO across two different vercel.app
  domains is NOT possible (cookies cannot cross domains). This build
  gives a shared DB + per-site sessions. SSO-on-a-shared-domain is a later
  step once custom domains exist.
- Admin: Google login restricted to `ADMIN_EMAILS` + mandatory TOTP 2FA
  (setup `/admin/setup-2fa`, challenge `/admin/verify-2fa`, valid 12
  hours, signed-cookie proof verified server-side on every /admin page
  and /api/admin route). Roles: SUPER (everything), SUPPORT (read
  users/notes/support/logs; no plan changes, deletes, money edits or
  settings), FINANCE (view-only money + expenses view). Enforced in the
  proxy (session presence) AND every page/API route (role + TOTP).
  `/admin`, `/account`, `/signin`, `/onboarding` are excluded
  from the sitemap and carry robots noindex + X-Robots-Tag.
- Payments: Paddle Billing (merchant of record), sandbox first. 5% +
  $0.50 per transaction; Paddle does NOT refund its fee on refunds.
  Monthly payouts — balance over $100 on the 1st sent by the 15th, up to
  3 working days to arrive — via wire or Payoneer. Stripe is OUT (Nepal
  not supported); Lemon Squeezy is backup only (not implemented); eSewa/
  Khalti are a future local option (not implemented).
- Age: onboarding enforces under-13 blocked (no data kept), 13–15 cannot
  activate, 16–17 free-only, 18+ paid. Self-declaration only, no ID.
- Job retention: Job rows older than 90 days are deleted
  (`POST /api/admin/cleanup`, SUPER only). Only hashed IPs are stored.

## Owner manual steps (in order)

1. **Supabase (owner taps — code cannot do these):** in the existing
   "LeadForge" project, add redirect URL
   `https://ai-studio-sandy-sigma.vercel.app/auth/callback` under
   Authentication > URL Configuration (the Google provider is already
   configured there — do NOT create a new Google Cloud OAuth client).
   Push the schema ONCE from either repo (`prisma db push`), paste the
   pooler `DATABASE_URL` into this Vercel project AND PDF Tools Hub,
   and set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_EMAILS` and a fresh
   per-site `TOTP_SECRET` (`openssl rand -base64 32` — never reuse one
   across sites) in Vercel Production, then redeploy. Never remove or
   overwrite `GROQ_API_KEY`. NOTE (Nov 2026): pushing from the ai-studio
   repo also creates the AI-Studio-only `LogoGeneration` table used by
   saved logo history; until that push, history APIs answer an honest 503
   and generations still work. Until these taps are done, live Google
   login CANNOT be proven — the code is built and tested without live
   credentials, but the live login path stays unproven by design.
2. **Google OAuth verification note:** full OAuth verification needs a
   verified domain the owner controls — a vercel.app subdomain cannot be
   verified, so OAuth works in Testing mode immediately (test users) and
   production verification needs a custom domain. Never claim
   verification is done until Google grants it.
3. **Admin:** set `ADMIN_EMAILS` to your Google email, sign in, then
   complete TOTP setup at `/admin/setup-2fa` and verify at
   `/admin/verify-2fa`.
4. **Paddle:** create an account → complete verification (passport as
   individual) → create a product + monthly price → set payout method
   (Payoneer or wire) → add webhook endpoint
   `https://ai-studio-sandy-sigma.vercel.app/api/webhooks/paddle` →
   paste `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_ID`
   (keep `PADDLE_ENV=sandbox`) → test checkout with Paddle test cards →
   switch `PADDLE_ENV` to production only after the sandbox test passes.
5. **AdSense:** only after approval, set `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID`.
   Ads stay off until then and never run on sign-in/admin/account pages.

## Deploy

- Live URL: https://ai-studio-sandy-sigma.vercel.app
- Vercel deploys from GitHub (or redeploy via Vercel tooling) WITHOUT
  teamId — passing teamId causes 403 on the shim used here.
- Never remove or overwrite existing Vercel env vars.
- Keep every tracked file's base64 under ~120 KB (no large binaries, no
  test screenshots/videos in the repo).
- Build: `npm run build` (runs `prisma generate` first). Lint: `npm run lint`.
  Tests: `npm test` (vitest), `npx playwright test` (chromium, needs a
  running server on port 3000).
- Sandbox note (local dev only, not Vercel): if `prisma generate` fails
  downloading engines through the sandbox proxy, serve the engines from
  a local mirror with `PRISMA_ENGINES_MIRROR=http://localhost:PORT`.
  Vercel's build reaches `binaries.prisma.sh` directly and needs no mirror.

## Security

- Zod on every endpoint; file type checked by MIME **and** magic bytes; filenames sanitized.
- SVG output whitelist-sanitized (no `script`, `foreignObject`, event handlers, `href`, or external references).
- Security headers in `next.config.ts`: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy.
- Error responses are generic only — no stack traces, secrets or internal paths.
- Uploads are processed in memory and never persisted or publicly listed.
- Supabase Auth: sessions via `@supabase/ssr` cookies; `/auth/callback`
  validates `next` as a relative path only (open-redirect tests in
  `tests/redirect.test.ts`); admin TOTP is the pre-existing custom
  RFC 6238 implementation (AES-256-GCM secret storage keyed by
  `TOTP_SECRET`), server-checked on every admin page and API route via
  the signed cookie — Supabase MFA deliberately not adopted (see
  Architecture). No service-role key exists in this repo: deleting a
  Supabase Auth identity itself requires the Supabase dashboard (the
  anon key cannot delete auth users); account delete removes the Prisma
  row and all its app data.
- Files are deleted immediately after processing (max 60 minutes in any case) — stated on each tool page.

## Moderation

- Logo prompts: keyword blocklist (~90 terms: major brands, characters, celebrity names),
  case-insensitive substring match, clean 400 on refusal; prompt capped at 300 characters.
  Extended categories (see `/acceptable-use`): trademark-copying, illegal, sexual and abusive
  prompts are refused the same way; only the category is logged, never the prompt text.
- Photo uploads: stated policy on the page (abusive/illegal content refused); enforcement at
  launch is type/size validation only — no external moderation API is wired in.

## Develop / build

```bash
npm install
npm run dev
npm run build
```

## Design

Bold creative-studio direction: pink `#EC4899`, cyan accent `#0891B2`, light `#FDF2F8`
background, white cards, `#FBCFE8` borders, `#475569` muted text. Inter for UI/body,
Playfair Display italic for display headlines only. Sharp corners, strong borders, dark/light
mode via `next-themes` (class strategy), mobile-first responsive, WCAG AA contrast
(white text on pink only for large/bold elements; body text stays dark on light backgrounds),
44px touch targets, visible focus rings, `prefers-reduced-motion` respected.
