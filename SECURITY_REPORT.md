# Security Report — AI Studio (auth, admin, payments build)

Scope: code added or changed in this build only (Auth.js v5, Prisma schema,
admin panel, Paddle checkout/webhook, legal pages, tool-route changes).
Pre-existing tool code was reviewed where it interacts with new code.
Date: November 2026. Method: manual OWASP Top 10 walkthrough, live curl
tests against a local production build, unit tests, and greps below.

## Verdict

Zero critical/high issues open. One medium fixed during the loop (SSRF
allowlist, S-6). Two honest gaps remain as owner steps, not code defects:
npm audit could not run in this sandbox (registry policy block, S-11) and
live Paddle sandbox checkout needs the owner's Paddle account (S-9).

## Findings

### S-1 Auth bypass — direct /admin URL logged out — PASS (fixed by design)
- Reproduction: `curl /admin` and `/account` with no session.
- Result: both 307 to `/signin`. Middleware (`middleware.ts`, Edge-safe,
  no Prisma) gates pages; `requireAdminPage` gates server pages again.
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
  from the Auth.js session, never from a query/body parameter, so there is
  no id to tamper with. Admin user pages require ADMIN role.
- Severity: none open.

### S-5 CSRF — PASS (partially live-verified)
- Mutations require a valid Auth.js session cookie (SameSite=lax,
  httpOnly). Cross-origin POST without a session returns 401/403
  (verified: export 401, admin export 403). Auth.js also validates the
  session cookie signature; there is no cookie-based action that works
  without a session.
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
- TOTP secret storage: AES-256-GCM with a key derived from AUTH_SECRET.
  If AUTH_SECRET ever rotates, stored TOTP secrets must be re-enrolled —
  documented in README.
