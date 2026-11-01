# Security Report — AI Studio (auth, admin, payments build)

## ADDENDUM 2026-11-01 — Supabase Auth rework (this change)

Scope: Auth.js v5 removed entirely; Supabase Auth (Google provider, existing
"LeadForge" project) + `@supabase/ssr` session handling; `proxy.ts` replaces
`middleware.ts` (Next.js 16.4 deprecates middleware.ts); Prisma schema change
is ONLY `User.supabaseId String? @unique`. Everything else (roles, plan,
status, age gate, admin TOTP, Paddle, legal pages, tools) is unchanged in
behaviour, adapted to Supabase identity. No live Google login is claimed:
live login needs the owner's Supabase redirect-URL + Vercel env taps (see
README "Owner manual steps"); all verification below was done without live
credentials, against a local production build with Supabase/DB env unset.

### Rework findings (all PASS as far as testable without live credentials)

- R-1 Session handling — PASS. Supabase cookies are httpOnly, refreshed by
  `proxy.ts` via `@supabase/ssr`; no home-grown JWT, no session data in
  client-readable storage. `getSessionSafe()` returns null (never throws)
  when Supabase/DB env is unset or the Prisma row is missing.
- R-2 Callback + open redirect — PASS (unit + e2e). `/auth/callback`
  exchanges the code server-side and redirects only through
  `safeRedirectPath` (relative paths only). Absolute, protocol-relative,
  backslash and encoded-slash `next` values all fall back to `/account`
  (tests/redirect.test.ts, 5 tests; e2e: external `next` still lands on
  /signin when no code is present — no external redirect issued).
- R-3 IDOR with Supabase ids — PASS (code). Account export/delete and
  checkout take the user id ONLY from the server session's Prisma row
  (mapped by supabaseId, then email); no route accepts a user id from a
  query/body parameter. Paddle webhook resolution is Supabase id first,
  then legacy Prisma id, then email, and only ever resolves to an existing
  Prisma row (unknown ids are ignored, never created).
- R-4 Admin bypass — PASS (code + unauthenticated e2e). `/admin` and
  `/account` redirect to `/signin` when logged out (Playwright); every
  /admin page re-checks role + SUSPENDED + signed TOTP cookie server-side
  (lib/admin-page.ts) and every /api/admin route re-checks role +
  SUSPENDED + TOTP cookie (lib/admin-guard.ts). The proxy only checks
  session presence — it is NOT the authority for role/TOTP, by design,
  because those live in Prisma. setup-2fa/verify-2fa are the only TOTP
  exemptions, as before.
- R-5 CSRF — PASS (unchanged posture). Mutations require a valid Supabase
  session cookie (SameSite=lax, httpOnly) plus, for admin routes, the
  signed TOTP cookie; unauthenticated POSTs return 401/403 (e2e:
  checkout 401, account export 401, account delete 401, admin export 403).
  No cookie-based action works without a session.
- R-6 XSS — PASS (unchanged). React escaping + SVG whitelist sanitizer
  untouched by this rework.
- R-7 Secrets scan — PASS. Grep over app/lib/components/prisma/docs for
  key/secret/token patterns returns no real values; `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET` and `AUTH_SECRET` are fully removed from code
  and docs (only historical rename notes mention AUTH_SECRET by name);
  no `SUPABASE_SERVICE_ROLE_KEY` exists anywhere; the anon key is public
  by design and is never committed (only an empty placeholder in
  .env.example). The Supabase project URL in .env.example is a public
  identifier, not a credential.
- R-8 npm audit — NOT RUNNABLE HERE (same sandbox registry block as S-11:
  `npm audit` returns 403 policy_denied). NOT a pass — owner step: run
  `npm audit` on his own machine before/after deploy.
- R-9 Account export/delete paths — PASS (unauthenticated) + HONEST LIMIT.
  Unauthenticated calls return 401 (e2e). Authenticated behaviour is
  unchanged except identity mapping. LIMIT: delete removes the Prisma row
  and app data, but the Supabase Auth identity itself can only be deleted
  with the service-role key or in the Supabase dashboard; this repo
  deliberately introduces NO service-role key, so dashboard deletion is
  the documented owner step (see COMPLIANCE_CHECKLIST.md). The same limit
  applies to the under-13 path: the Prisma row is deleted and the user is
  signed out, but the Supabase identity needs the dashboard step.
- R-10 Age gate + checkout gating — PASS (code, unchanged logic).
  Under-13 deletes the Prisma row, 13–15 cannot activate, 16–17 free-only,
  18+ paid; checkout still requires age 18+ and rejects SUSPENDED.
  Enforcement moved from middleware JWT claims to the callback route +
  /account page + server actions (middleware/proxy cannot read Prisma).
- R-11 TOTP decision — KEPT custom TOTP, Supabase MFA NOT adopted. Why:
  the custom RFC 6238 implementation (AES-256-GCM secrets keyed by
  per-site TOTP_SECRET, signed 12h cookie, server-checked on every admin
  page/API route) already works and is unit-tested; Supabase MFA would add
  a second enrolment flow and a second second-factor store for the same
  admins with no security gain, and would complicate the admin UX (two
  factors to manage). TOTP_SECRET replaces AUTH_SECRET for cookie signing
  and secret encryption (renamed, not shared across sites); routes fail
  closed (503) when it is unset.

Retest counts (this rework): vitest 20/20 (incl. 5 new redirect tests);
Playwright auth spec 6 tests + public spec (run against local production
build, see below); production build exit 0 with DATABASE_URL and Supabase
env unset; lint: pre-existing errors in untouched files only (see report
to coordinator), no new lint errors from this rework after the router fix.

Scope: code added or changed in this build only (Auth.js v5, Prisma schema,
admin panel, Paddle checkout/webhook, legal pages, tool-route changes).
Pre-existing tool code was reviewed where it interacts with new code.
Date: November 2026. Method: manual OWASP Top 10 walkthrough, live curl
tests against a local production build, unit tests, and greps below.

## ADDENDUM 2026-11-01 — logo quality + history release (this change)

New attack surface reviewed: brand-name `<text>` in SVGs, a new `LogoGeneration`
table, new `/api/account/jobs` routes, a guest counter peek, and client-side
SVG→canvas PNG conversion. Findings:

- **SVG `<text>` (PASS):** the sanitizer allows `<text>` with 8 safe attributes only
  (`x, y, fill, font-family, font-size, font-weight, text-anchor, opacity`); handlers,
  `href`, and external references are still stripped; text nodes are copied only inside
  `<text>`, capped at 120 chars, and entity-escaped. Covered by `tests/logo.test.ts`
  (text kept, script/handler payloads stripped, long nodes capped).
- **History IDOR (PASS by construction):** every jobs query filters `userId` from the
  session; `[id]` routes use `updateMany`/`deleteMany` with `{ id, userId }` and 404
  on zero rows, so one user cannot favorite/delete another's logos.
- **Counter peek (PASS):** `peekAiRateLimit` reads the in-memory counter without
  incrementing; Upstash guests get `remaining: null` rather than a fabricated count.
- **Client PNG conversion (PASS):** canvas draws only the server-sanitized SVG blob
  (same-origin, no external refs possible post-sanitize); the Sharp server route
  remains as fallback and re-sanitizes.
- **Secrets (PASS):** grep of the repo (names only in messages/comments) and of the
  client bundle found no key values; the only key NAME in client JS is the
  pre-existing user-facing label mentioning `REPLICATE_API_TOKEN`, not a value.
- **Model change (noted, not a finding):** `openai/gpt-oss-120b` primary,
  `openai/gpt-oss-20b` fallback; `llama-3.3-70b-versatile` retired (404) and unused.

## Verdict

Zero critical/high issues open. One medium fixed during the loop (SSRF
allowlist, S-6). Two honest gaps remain as owner steps, not code defects:
npm audit could not run in this sandbox (registry policy block, S-11) and
live Paddle sandbox checkout needs the owner's Paddle account (S-9).

## Findings

### S-1 Auth bypass — direct /admin URL logged out — PASS (fixed by design)
- Reproduction: `curl /admin` and `/account` with no session.
- Result: both 307 to `/signin`. The session proxy (`proxy.ts`, no Prisma) gates session presence;
  `requireAdminPage` gates server pages again (role + TOTP).
- Severity: none open.

### S-2 Admin API without session — PASS
- Reproduction: `curl /api/admin/export?type=users` with no session.
- Result: 403 `{"error":"Forbidden."}`. Every `/api/admin/*` route calls
  `requireAdmin` (role + TOTP), independent of middleware.
- Severity: none open.

### S-3 Privilege escalation (SUPPORT/FINANCE hitting SUPER routes) — PASS (code)
- Enforcement: `requireAdmin(req, ["SUPER"])` on user PATCH/DELETE,
  settings, expenses, block, cleanup; SUPPORT allowed only notes +
  support replies; FINANCE allowed only money export/view pages.
- Not live-testable here (no Google session exists in this sandbox);
  verified by reading every route's `requireAdmin` call. Owner step:
  re-verify with real SUPPORT/FINANCE accounts after first admin login.
- Severity: none open (code), live re-check owed.

### S-4 IDOR — user A fetching user B's jobs/export — PASS (code)
- `/api/account/export` and `/api/account/delete` take the user id ONLY
  from the Supabase-mapped server session, never from a query/body parameter, so there is
  no id to tamper with. Admin user pages require ADMIN role.
- Severity: none open.

### S-5 CSRF — PASS (partially live-verified)
- Mutations require a valid Supabase session cookie (SameSite=lax,
  httpOnly, signature verified by Supabase). Cross-origin POST without a
  session returns 401/403 (verified: export 401, admin export 403).
  There is no cookie-based action that works without a session.
- Severity: none open.

### S-6 SSRF — MEDIUM, FIXED
- Finding: `app/api/enhance/route.ts` fetched the Replicate prediction
  output URL after only checking `https://`. A compromised or spoofed
  prediction could have pointed at an internal host.
- Fix applied: hostname allowlist — only `replicate.delivery` (and
  subdomains) over HTTPS is fetched; anything else returns null and the
  enhancer falls back to the Sharp pipeline. No server-side fetch of any
  user-supplied URL exists anywhere else (grep: only Groq, Replicate and
  Paddle fixed hosts, plus the allowlisted delivery host).
- Severity after fix: none open.

### S-7 XSS — PASS
- React escapes all rendered user data. The only `dangerouslySetInnerHTML`
  uses are: static JSON-LD constants (no user data) and the logo SVG
  preview — which renders only server-side whitelist-sanitized SVG
  (`lib/svg-sanitize.ts`: script, foreignObject, event handlers, href and
  external references stripped; unit-tested in `tests/sanitize.test.ts`).
- Severity: none open.

### S-8 SQL injection — PASS
- All database access is Prisma Client with bound parameters. Grep for
  `$queryRaw`/`$executeRaw` returns nothing. No raw SQL exists.
- Severity: none open.

### S-9 Webhook forgery / replay — PASS (code + SDK test)
- Signature: `paddle.webhooks.unmarshal(raw, secret, signature)` with the
  raw body; bad signature returns 400. Verified with the real SDK in
  Node: a correctly HMAC-signed payload passes verification (then fails
  only on entity mapping of the incomplete synthetic fixture — the
  signature step itself passed, proven by the different error from a bad
  signature, which the SDK rejects with "Webhook signature verification
  failed"). Replay: `WebhookEvent.eventId` is unique; a duplicate event
  id returns 200 `ignored`.
- Live sandbox end-to-end test (real Paddle sandbox keys + test card)
  still needs the owner's Paddle account — see COMPLIANCE_CHECKLIST.md.
- Severity: none open (code); live sandbox test owed.

### S-10 File-upload abuse — PASS
- Pre-existing checks kept: magic-byte + MIME validation, 10 MB cap,
  in-memory processing, never persisted or listed. The admin flagged view
  shows metadata only (blocked category + error code); uploaded image
  contents are never stored and never rendered in admin.
- Severity: none open.

### S-11 Dependency audit — GAP (environment, not code)
- `npm audit` could not run in this sandbox: the registry audit endpoint
  returns 403 `policy_denied` under the sandbox egress policy. This is NOT
  a clean bill of health. Owner step: run `npm audit` on a machine with
  registry access before treating dependencies as reviewed, and fix any
  critical/high findings.
- Severity: unknown until run; recorded honestly, not claimed green.

### S-12 Rate-limit bypass — PASS (live)
- Burst test (local prod build, guest IP): 10 logo requests returned
  503 (honest no-key state locally) and the 11th/12th returned 429.
  Signed-in quotas are counted from Job rows per user per day.
- Severity: none open.

### S-13 Secrets in repo — PASS
- Grep for hardcoded `api_key`/`secret`/`token`/`password` values across
  `app/`, `lib/`, `components/`, `prisma/` (excluding `.env.example`
  placeholders and `process.env` reads) returns nothing. `.env.example`
  contains placeholders only. `git status` shows no `.env*` files.
- Severity: none open.

### S-14 Security headers — PASS (live)
- Verified on local prod build: CSP, HSTS, X-Frame-Options, nosniff,
  Referrer-Policy all present; `X-Robots-Tag: noindex, nofollow` on
  `/admin`. Live-site re-check is part of the deploy verification.
- Severity: none open.

### S-15 Age / account deletion — PASS (code)
- Under-13 onboarding deletes the user row (cascades remove accounts,
  sessions, subscriptions, payments, notes; jobs null out; authored
  notes and audit rows deleted explicitly) and keeps no age data.
  13–15 saves nothing. Checkout enforces 18+ from `dateOfBirth`.
- Severity: none open.

## Notes / deliberate choices

- `middleware.ts` is kept (not renamed to `proxy.ts`): in Next.js 16 the
  proxy convention runs on Node.js, not Edge, and this middleware must
  stay Edge-safe with no Prisma. The build's deprecation warning is
  expected and documented, not an error.
- Pre-existing lint errors in untouched files (CookieBanner,
  ThemeToggle, TurnstileWidget, svg-sanitize, home image alt) were left
  alone; all new/changed files lint clean.
- TOTP secret storage: AES-256-GCM with a key derived from TOTP_SECRET
  (renamed from AUTH_SECRET in the 2026-11-01 Supabase rework).
  If TOTP_SECRET ever rotates, stored TOTP secrets must be re-enrolled —
  documented in README.
