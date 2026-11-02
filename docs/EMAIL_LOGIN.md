# Email + password sign-in (AI Studio)

One shared admin login across the owner's Supabase sites: the same account
(`dipeshkarki8292@gmail.com`) + the password the owner sets himself once in
the Supabase dashboard signs into AI Studio, PDF Tools Hub, and the AI Video
Clipper (shared LeadForge project). This document covers the AI Studio side.

## Honest status note

The email + password form itself already existed in this repo (added 2026-11-01,
commit `403d8ba`) and was already rendered alongside the Google button. This
change does NOT re-build it; it verifies the whole path, extracts the logic
into a tested helper, adds the admin hard gate and redirect coverage below,
fixes stale copy, and documents the owner's remaining steps. Nothing here
claims a live login until the owner's steps land.

## What was added / changed

- `lib/supabase/password-signin.ts` — NEW: the email + password sign-in
  logic, extracted from the form so it is unit-testable (trim email, call
  `signInWithPassword`, one generic error message that never reveals which
  accounts exist, not-configured message when Supabase env is absent).
- `app/signin/PasswordSignIn.tsx` — REFACTORED (no behavior change): the
  form now calls the helper; same UI, same messages, same full-page
  navigation on success so server components re-read fresh session cookies.
- `lib/supabase/oauth-redirect.ts` — NEW: builds the Google OAuth redirect
  target (`{origin}/auth/callback?next=...`) so the construction is tested
  instead of inline in the button.
- `app/signin/SignInButton.tsx` — REFACTORED (no behavior change): uses the
  redirect helper; still passes this site's own origin + `/auth/callback`.
- `lib/admin-page.ts` — ADDED `requireAdminLayout()`: session + admin-role +
  suspended checks WITHOUT a TOTP check, for the admin layout (see below).
- `app/admin/layout.tsx` — NOW GUARDED: calls `requireAdminLayout()` before
  rendering any admin heading, nav, or content; also fixes stale copy
  ("Google sign-in" → "sign-in").
- `components/site/FooterAdminLink.tsx` — NEW: footer Admin link rendered
  only when the visitor is signed in (same `/api/auth/me` probe the header
  uses, so public pages stay static).
- `components/site/Footer.tsx` — the previously unconditional Admin link is
  replaced by `FooterAdminLink`.
- `app/signin/page.tsx` — metadata description no longer says "with Google"
  only; the page already rendered both sign-in methods.
- `.env.example` — comment fix only ("Google-only" → Google + email/password).
- `tests/password-signin.test.ts` — NEW: helper behavior (trim, generic
  error leaks nothing, not-configured) + shared sign-out path (called once
  when configured, never throws).
- `tests/oauth-redirect.test.ts` — NEW: callback URL always stays on this
  site's origin + `/auth/callback`, with `next` encoded.
- `tests/admin-hard-gate.test.ts` — NEW: page gate, layout gate, and API
  gate redirect/403 behavior (see below).
- `tests/redirect.test.ts` — UNCHANGED: already covered `safeRedirectPath`
  (absolute, protocol-relative, backslash, encoded, `javascript:` URLs all
  rejected) — the callback's same-site guarantee.

## Admin hard gate (this change)

Before: every `/admin` page already called `requireAdminPage` (session +
admin role + TOTP), and every `/api/admin/*` route called `requireAdmin` —
but the admin LAYOUT rendered its heading + full nav unconditionally, and
the footer linked `/admin` to everyone, so a logged-out visitor could SEE
the console chrome even though every page would have redirected them.

After:
- The layout calls `requireAdminLayout()` FIRST: no session, non-admin, or
  suspended → redirect to `/signin` before any admin UI renders. TOTP is
  deliberately NOT checked at layout level, because `setup-2fa` and
  `verify-2fa` must render for admins who do not hold a valid second factor
  yet; every page still enforces TOTP itself (except those two, which pass
  `skipTotp`).
- The header already showed its Admin link only when signed in (via
  `/api/auth/me`, pending state shows neither link) — unchanged.
- The footer Admin link is now also signed-in-only (`FooterAdminLink`).
- Admin access itself is UNCHANGED: ADMIN_EMAILS allowlist (first allowlisted
  login becomes ADMIN + SUPER) + mandatory TOTP 2FA. Email sign-in alone
  NEVER grants admin — a non-allowlisted user stays a plain user, exactly
  as with Google sign-in, because gating reads the session + Prisma role,
  never the sign-in method (sessions carry no provider field at all).

## Login redirect (verified, code side)

Chain, all verified in code and covered by tests:
1. Google button → `oauthCallbackUrl(window.location.origin, next)` →
   `{this site's origin}/auth/callback?next=...` (never another site).
2. Email form → `window.location.assign(next)` where `next` was already
   validated by the sign-in page via `safeRedirectPath` (relative paths
   only).
3. `/auth/callback` exchanges the code, upserts the Prisma user, then
   redirects only via `safeRedirectPath` (absolute/external/`//`/`javascript:`
   values fall back to `/account`).
4. The Supabase dashboard Redirect URLs allowlist is a SEPARATE dashboard
   setting, not code: if a callback URL is missing there, Supabase ignores
   the requested redirect and falls back to the project's Site URL. The
   parent fixed the allowlist separately (clipper callback was missing and
   is now added); this change only confirms the code side is correct.
   End-to-end live login test by the owner is still owed as final proof.

## Session handling (unchanged, verified)

- First login upserts the Prisma User by `supabaseId`, then email — for
  BOTH methods: the OAuth callback upserts explicitly, and
  `getSessionSafe()` (used by every page/guard) upserts on every server
  read, so a password-signed-in user gets identical treatment on their
  first `/account` load, including the suspended message and the
  age-confirmation onboarding redirect.
- Sign-out (`supabaseSignOut`, used by the account page and onboarding)
  clears the Supabase session. The TOTP marker cookie is NOT separately
  cleared on sign-out, and that is safe: the marker is verified against a
  live session's user id, so without a session it grants nothing.
- No password is ever created, stored, or logged by this app. No public
  sign-up form exists anywhere. Password reset is dashboard-only: there is
  no reset-password page wired in this app, so a forgotten password is
  reset by the owner in Supabase Authentication → Users.

## Owner's remaining steps, in order

Already done by the parent (do NOT redo): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `ADMIN_EMAILS` set in this project's
Vercel env (production + preview).

1. Paste `DATABASE_URL` (Supabase Postgres pooler string) into the
   ai-studio Vercel project + redeploy. Until this lands, login shows
   "not configured" behavior and no account features exist.
2. In Supabase Authentication → Sign in / Providers, enable the Email
   provider (once — the shared project covers all three sites).
3. In Supabase Authentication → Users, create/confirm the
   `dipeshkarki8292@gmail.com` user with the password, set by the owner's
   own hands. Never send that password in chat or put it in code.
4. Sign in here (Google or email — same account), then set the per-site
   `TOTP_SECRET` in Vercel + enrol at `/admin/setup-2fa` and verify.
   Admin pages require the TOTP step; without it they redirect to
   `/admin/verify-2fa`.

## Manual QA checklist

- [ ] Email sign-in with the dashboard-created account reaches `/account`.
- [ ] Google sign-in still works (same account, same row, no duplicate).
- [ ] Wrong password shows only the generic message (no "unknown email"
      vs "wrong password" distinction).
- [ ] A signed-in NON-allowlisted user opening `/admin` is redirected
      away and never sees console content.
- [ ] A logged-out visitor opening any `/admin` page is redirected to
      `/signin` and never sees admin headings or nav.
- [ ] Footer + header Admin links are hidden while logged out.
- [ ] Admin pages still require TOTP (redirect to `/admin/verify-2fa`
      without it); setup-2fa works before TOTP exists.
- [ ] Sign-out clears the session (account page then redirects to sign-in).
- [ ] Google sign-in lands back on this site (own origin + `/auth/callback`),
      never on another site.
- [ ] No sign-up form exists anywhere on the site.

## Honest gaps

- Login is NOT live until the owner's steps above land (DATABASE_URL +
  redeploy + TOTP secret + enrolment). This change is code + tests only.
- Playwright e2e specs were NOT run here (no browsers in this environment);
  the existing `tests/e2e/auth.spec.ts` covers the no-env honest states.
  The new form, layout guard, and footer link rendering are covered by the
  unit tests above plus the manual checklist, not by a browser run.
- With `DATABASE_URL` unset, a password sign-in leaves the Supabase cookie
  set but yields no app session (the account page redirects back to
  sign-in); the OAuth callback instead signs out explicitly in that state.
  Both end at the sign-in page with the honest "not configured" behavior —
  a cosmetic difference, not a loop, and it disappears once DATABASE_URL
  lands.
