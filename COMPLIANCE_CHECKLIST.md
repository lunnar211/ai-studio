# Compliance Checklist — AI Studio

Status key: DONE = implemented in code and verified as far as this sandbox
allows; NEEDS-OWNER-ACTION = needs the owner's account, taps, or a live
third-party step that no agent can do alone. Nothing below is claimed done
unless the evidence column says how it was checked.

## Google OAuth verification

| Rule | Status | Evidence / file |
| --- | --- | --- |
| Google-only sign-in, minimal scopes openid/email/profile | DONE | Supabase Auth Google provider (reused existing project config); `app/signin/SignInButton.tsx` calls `signInWithOAuth({provider:"google"})`, callback at `app/auth/callback/route.ts` |
| Credentials via env only, never hardcoded | DONE | Supabase URL/anon key via env only (placeholders in .env.example); `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`AUTH_SECRET` REMOVED in the 2026-11-01 rework; secrets grep clean; no service-role key anywhere |
| App name, logo, privacy + terms URLs, authorized domains in Cloud Console | NEEDS-OWNER-ACTION | REUSED existing Supabase project Google provider — no new Cloud client. Owner adds redirect URI `https://ai-studio-sandy-sigma.vercel.app/auth/callback` in Supabase Authentication > URL Configuration (and the sister site's URI in the same project if sharing); app name/logo + `/privacy` + `/terms` links are the existing provider's settings. |
| One project can serve both sites (both redirect URIs) | DONE (documented) | README architecture section; separate TOTP_SECRET per site; both sites use their own /auth/callback redirect URI |
| HONEST CAVEAT: full OAuth verification needs a verified domain the owner controls; a vercel.app subdomain cannot be verified. OAuth works in Testing mode immediately (test users only); production verification needs a custom domain. Verification is NOT claimed done. | NEEDS-OWNER-ACTION | README + this file |

## AdSense program policies

| Rule | Status | Evidence / file |
| --- | --- | --- |
| Original content, required pages present | DONE | `/`, tool pages, `/about`, `/contact`, `/privacy`, `/terms`, `/cookies`, `/refund-policy`, `/acceptable-use`, `/dmca`, `/disclaimer` |
| Ads only after approval + consent | DONE | `components/site/AdSlot.tsx` renders nothing without publisher ID AND cookie-banner acceptance |
| No ads on login/admin/account/empty pages | DONE | AdSlot is never placed on `/signin`, `/admin`, `/account`; no ad slot is rendered anywhere today (publisher ID unset) |
| AdSense approval itself | NEEDS-OWNER-ACTION | Owner's AdSense application; approval email awaited; then set `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` |

## Paddle business rules

| Rule | Status | Evidence / file |
| --- | --- | --- |
| Merchant of record; 5% + $0.50 fee; fee not refunded on refunds | DONE (stated) | `/refund-policy`, `app/admin/money/page.tsx` fee estimate, README |
| Payouts: monthly, balance over $100 on the 1st sent by the 15th, up to 3 working days, wire or Payoneer; FX margin up to 1.5%; possible $15 SWIFT fee | DONE (documented) | README owner steps |
| Nepal not on Paddle's unsupported list (sanctions-only) | DONE (per coordinator research, Nov 2026 sources) | README |
| Sandbox-first implementation, idempotent webhook, no card data stored | DONE (code) | `app/api/checkout/route.ts`, `app/api/webhooks/paddle/route.ts`, SDK signature test in SECURITY_REPORT.md |
| Paddle account, verification (passport as individual), product + monthly price, payout method, webhook endpoint `https://ai-studio-sandy-sigma.vercel.app/api/webhooks/paddle`, env vars, switch PADDLE_ENV to production after sandbox test | NEEDS-OWNER-ACTION | README owner steps |
| Live sandbox checkout test with Paddle test cards | NEEDS-OWNER-ACTION | Needs sandbox keys; record evidence when run |

## Vercel fair use

| Rule | Status | Evidence / file |
| --- | --- | --- |
| No large binaries in repo; every tracked file base64 under ~120 KB | DONE | No binaries added; no test screenshots/videos in repo; check before push |
| Deploys without teamId | DONE | Deploy step uses no teamId (see README) |
| Build succeeds with DATABASE_URL unset | DONE | Local build exit 0 with DATABASE_URL unset (prisma generate + next build); guest tools work without DB |

## Nepal Privacy Act 2018 + Electronic Transactions Act

| Rule | Status | Evidence / file |
| --- | --- | --- |
| Data rights (export + delete) offered | DONE (with honest limit) | `/account` export/delete; `app/api/account/*`. LIMIT: Prisma row + app data deleted by the app; the Supabase Auth identity itself needs a Supabase dashboard deletion (anon key cannot delete auth users; no service-role key introduced) |
| Data minimization (hashed IPs only, no file contents, no card data, 90-day job retention) | DONE | `lib/ip-hash.ts`, `prisma/schema.prisma`, `app/api/admin/cleanup/route.ts` |
| Stated accurately, not as legal advice | DONE | `/privacy` and `/terms` carry "not legal advice" wording |
| Nepal's Privacy Act 2018 sets no fixed digital-consent age, so 16 is the conservative alignment (GDPR default); under-13 blocked entirely; 18+ for paid (contractual capacity) | DONE | `lib/age.ts`, `/terms`, `/onboarding` |

## Age thresholds — reasoning (also on /terms)

- Under 13: blocked entirely, no data kept (COPPA + GDPR-K lower bound).
- 13–15: account cannot be activated.
- 16–17: free account only, paid checkout blocked (GDPR default
  digital-consent age, strictest common standard).
- 18+: paid plans allowed (contractual capacity).
- Self-declaration only; no ID documents are ever requested.

## Shared database + SSO limit (honest)

- Shared: DATABASE_URL (same Supabase Postgres project, pooler string) —
  the user row is shared between AI Studio and PDF Tools Hub. Schema
  change of the 2026-11-01 rework: ONLY `User.supabaseId String? @unique`
  added; legacy Auth.js Account/Session/VerificationToken tables retained
  unused for shared-DB parity (do not drop them).
- NOT shared: TOTP_SECRET (different per site; sharing one would let one
  site forge the other's TOTP cookies/secrets).
- Supabase Auth identity deletion (account delete + under-13): the Prisma
  row and app data are deleted by the app, but the Supabase Auth identity
  itself needs a Supabase dashboard deletion (the anon key cannot delete
  auth users; no service-role key is introduced — dashboard deletion is
  the least-privilege path). Owner step on any delete request.
- SSO limit: true one-login SSO across two different vercel.app domains
  is NOT possible (cookies cannot cross domains). This build gives a
  shared DB + per-site sessions. SSO-on-a-shared-domain is a later step
  once custom domains exist.

## Update 2026-11-01 — logo history + pricing honesty

- Saved logos (`LogoGeneration` table) are the user's own data: they are
  included in the account data export and deleted with the account
  (relation `onDelete: Cascade`); the history UI also offers per-item
  delete and clear-all.
- The `/pricing` page invents no price: the Premium price lives in Paddle
  and is shown at checkout. The page states this plainly instead of
  showing a figure the owner has not set.
- Logo prompts are sent to Groq for generation only; the logo page and
  FAQ state this, and outputs are labelled AI-generated in the tool.
