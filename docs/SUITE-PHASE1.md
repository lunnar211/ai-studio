# AI Studio Suite — Phase 1: Control Plane

## 0. Audit (written before building; verified against the tree at ab35438)

### What already exists — Phase 1 completes it, it does not start from zero

**Per-user panel: `/account` (with `/dashboard` redirecting to it).** A signed-in
user already sees only their own data: profile + plan, usage today, logo
history (favorites), job history (last 50), photo jobs (last 20), subscriptions,
recent payments, and export/delete of their own data. Gating is three layers
deep: `proxy.ts` requires a session for `/account` (redirect to `/signin`,
destination preserved in a validated `next` param); the page itself redirects
to `/signin` with no session and shows a suspended notice for suspended
accounts; age-unconfirmed users go to `/onboarding`. The header shows "My
account" / "Admin" links only when signed in. Signed-out visitors see zero
panel UI. What the panel did NOT show: any credit/budget picture (see below).

**Master admin panel: `/admin`.** Hard layout gate (`requireAdminLayout` in
`lib/admin-page.ts`) redirects no-session / non-ADMIN / suspended visitors to
`/signin` BEFORE any admin heading, nav, or content renders; every page then
enforces TOTP itself via `requireAdminPage` (setup-2fa / verify-2fa pass
`skipTotp` so enrolment stays reachable); every `/api/admin/*` route enforces
role + TOTP + suspension via `requireAdmin` (`lib/admin-guard.ts`):
SUPER = everything, SUPPORT = read users/notes/support/logs, FINANCE =
view-only money. Existing pages: dashboard overview, users list, user detail
(jobs / notes / payments / subscriptions), money, usage & abuse (top users,
flagged prompts category-only, failed jobs, blocked IPs — metadata only, never
file bytes), AI health, settings (incl. per-provider on/off toggles), database
viewer, support inbox, logs. Existing SUPER actions: suspend/restore, plan
change, reset today's limits, delete user (self-delete and self-role-change
refused), internal notes. Every admin API route already writes an
`AuditLog` row via `auditAdmin` (actor, action, target, ip hash, time).

**Auth/session model.** Supabase Auth (Google + email/password) on the shared
LeadForge project; `User.supabaseId` maps the Supabase user to the Prisma row
(`getSessionSafe`, `lib/auth.ts`); admin identity = `ADMIN_EMAILS` allowlist +
mandatory TOTP 2FA (per-site `TOTP_SECRET`, 12h marker cookie). New auth users
are created by the owner in the Supabase dashboard — no in-app user creation.

**Credits — the honest picture.** There is NO user credit balance anywhere.
Free photos and logos are UNLIMITED by owner decision (2026-11-01,
`lib/limits.ts`); the only budget in the system is the Premium paid-GPU
fair-use budget (100/day, `photoCreditsPremium`), accounted as
`SUM(AiUsageLog.credits)` for today's photo jobs (`lib/ai/credits.ts`), with a
Job-row fallback when the usage table is missing. The image generator is
separately credit-gated (sign-in, 10/day free, 100/day Premium). So a "credit
adjustment" in this codebase can only honestly mean one thing: a recorded
delta to a user's Premium paid-GPU budget. It is NOT a balance edit, and it
does nothing for FREE users (free routes never touch the GPU budget).

### Gaps Phase 1 closes

1. **No credit adjustment at all** — no API, no UI, no record.
2. **Audit trail has no reason and no readable viewer.** `AuditLog` has no
   `reason` column; the `/admin/logs` page shows raw actor ids (not emails)
   and no reason. Admin actions that change a client's standing (suspend,
   plan, role, limits reset, delete) took no reason.
3. **Admin actions took no reason.** Suspend/restore, plan change, role
   change, limits reset, delete all ran reason-free.
4. **User panel showed no budget picture.** A Premium user could not see
   their GPU budget, usage, adjustments, or remaining allowance.
5. **No single audit page.** The logs page mixes audit + errors + webhooks
   and resolves no actor emails.

### Discrepancy flagged, not silently changed

The Phase 1 brief assumes "no in-app role granting (roles change in Table
Editor only, as today)". The code disagrees: `app/admin/AdminForms.tsx`
(UserActions) + `PATCH /api/admin/users/[id]` already let a SUPER change a
user's role/adminRole in-app (self-change refused). Removing that form would
break existing behavior, and adding a new granting path would violate the
brief — so Phase 1 does NEITHER: it leaves the existing form untouched, adds
no new granting path, and records this as a decision owed to the owner
(keep the form, or remove it deliberately in a later phase).

### Schema constraint and the judgment call

The schema is shared with PDF Tools Hub (`prisma/schema.prisma` header:
same tables/columns; AI-Studio-only tables ignored by the sister client).
Phase 1 needs two things no existing column holds: a reason on audit rows,
and a credit-adjustment record. Following this repo's own established pattern
(LogoGeneration / AiUsageLog / PhotoJob: additive model, owner pushes once,
code degrades honestly when the table is missing), Phase 1 adds — as files
only, NEVER run by this phase — a nullable `AuditLog.reason` column and a
new `CreditAdjustment` model. Nullable-additive is database-compatible with
the sister site (it never selects these fields). If the owner never pushes,
every new code path degrades to an honest "schema update pending" message
and refuses to record, instead of faking it. No other schema change, no
rename, no base-schema re-run, nothing pushed from a neighbour repo.

### Baselines (before building, tree ab35438)

- vitest: 181/181 (30 files). tsc: 0 errors.
- eslint repo-wide: 4 problems (3 errors, 1 warning), all pre-existing in
  untouched files (ThemeToggle, TurnstileWidget, ai/types, svg-sanitize).
  Phase 1 rule: zero NEW hits in touched files.

## 1. What was built (Phase 1 — control plane only, no editors)

### Per-user panel (completed, not newly invented)

`/account` (with `/dashboard` redirecting to it) was already the panel; Phase 1
adds the one picture it lacked and proves its gating:

- **Premium GPU budget section** on `/account` (own data only — the session
  user id is the only filter): budget, today's usage, recorded adjustments,
  remaining. FREE users see one honest line instead of a meaningless number
  ("Premium GPU budget does not apply here — free routes are unlimited").
- **Gating proven, not weakened:** proxy session requirement + page redirect +
  suspended notice + age-onboarding gate, all unchanged. Header shows "My
  account" / "Admin" only when signed in. Signed-out visitors see zero panel
  UI. No panel route accepts a caller-supplied user id for panel data — the
  session user id is the filter everywhere, which is what "own-data-only"
  means in code.

### Master admin panel (owner only — ADMIN_EMAILS + TOTP gate unchanged)

- **Audit trail page `/admin/audit`** (SUPER + SUPPORT + FINANCE, read-only):
  every admin action newest first, with actor EMAIL (not just an id), action,
  target, reason, and time. Append-only by construction — no route edits or
  deletes audit rows (user deletion removes that user's own rows and leaves
  the deleter's row, as before). No tokens, file bytes, or secrets appear.
- **Credit adjustments page `/admin/credits`** (SUPER only): cross-client
  record of every GPU-budget delta — user email, signed amount, reason,
  acting admin, date.
- **Credit adjustment API `POST /api/admin/credits`** (SUPER + TOTP): body
  `{userId, amount, reason}`; amount must be a nonzero whole number within
  ±10000; reason mandatory (1–500 chars); target must exist. Writes a
  `CreditAdjustment` row AND a `credit.adjust` audit row with the reason.
  Missing table (schema not pushed) → honest 503 "schema update pending",
  never a fake success. No paid AI call happens here.
- **Reason required on user-affecting actions.** `PATCH /api/admin/users/[id]`
  (suspend/restore, plan, role, limits reset) and `DELETE` now require a
  reason and record it on the audit row. `UserActions` gained one required
  reason box serving all its actions; delete keeps its confirm dialog and
  adds the reason field. System actions (settings, notes, blocks, expenses,
  support, cleanup) keep auditing as before without a reason — they change no
  client's standing, and their action names already say what happened.
- **User detail page** (SUPER sees the new parts): `CreditForm` (amount +
  reason), the client's adjustment history with actor emails, total delta,
  and effective Premium budget. Job oversight stays status-only (tool,
  status, error code, date — never file bytes).
- **Admin nav** gained Audit trail + Credit adjustments links. The layout
  hard gate, per-page TOTP, API role guard, and setup-2fa/verify-2fa paths
  are byte-for-byte unchanged in behavior.

### Budget accounting (the one behavior change, and why it is safe)

`checkPhotoCredits` now checks against the EFFECTIVE Premium budget (plan
budget + recorded adjustments, floored at zero). FREE callers are untouched
(always pass, cost 0 — free routes never touch this module). The plan budget
itself still comes from the single limits config; adjustments only add to
it. `photoCreditBudget(plan)` keeps its old signature for existing callers.

### Schema files (NOT run — owner pushes once)

- `AuditLog.reason` (nullable) + new `CreditAdjustment` model (see audit
  section above). `prisma generate` ran locally so the client compiles;
  no database was touched, no migration was run, nothing was pushed from
  this repo or any neighbour. Until the owner pushes once from this repo,
  adjustments refuse with "schema update pending" and audit rows fall back
  to reason-less rows (see `lib/settings.ts` fallback) instead of failing.

## 2. Panel map

| Who | Panel | Route | Sees | Cannot see / do |
|-----|-------|-------|------|-----------------|
| Signed-out visitor | none | — | nothing (redirect to /signin) | any panel UI, any user data |
| Signed-in user | own panel | `/account` (`/dashboard` redirects) | own jobs, photo jobs, logo history, subs, payments, usage, own GPU budget, own export/delete | any other user's data; any admin page |
| Admin SUPPORT | master (read) | `/admin/*` | users, notes, audit trail, usage, logs | plan/status/role changes, credits, settings, money edits |
| Admin FINANCE | master (money view) | `/admin/*` | money, audit trail (read) | user edits, credits, settings |
| Admin SUPER (owner) | master (full) | `/admin/*` | everything incl. suspend/restore, plan/role, credits, settings | own role change, own deletion (refused); new admin creation (Supabase dashboard only) |

## 3. Editor architecture — next phases (spec only, no editor UI built here)

Order, with reasons:

1. **Audio clean/edit FIRST.** Smallest scope, no new paid dependency:
   browser-first Web Audio (noise gate, normalize, trim, mute/replace —
   the same browser-first pattern the photo tools already use), with
   per-user job records from day one. It serves the "clean my audio"
   need directly and does not touch the clipper's clip pipeline (no
   moments, no captions, no vertical render). Provider: on-device first;
   server enhancement only later, Premium-gated, with spend approval.
2. **Photo-to-motion SECOND.** Turns a photo into a short moving clip
   (the "motion" ask). Needs a video-generation provider — Gemini video
   via the existing `GEMINI_API_KEY` is the natural first candidate —
   but video generation is PAID per second, so this phase needs the
   owner's spend approval + Premium gating + per-user quotas before any
   call is wired. Moderate scope; reuses the async-job pattern.
3. **Video enhance THIRD.** Heaviest: GPU processing, long jobs, the
   PhotoJob state-machine pattern (poll → advance → finalize), Premium
   only, spend approval required. It also needs the most quota/audit
   care, which is why it comes last, after the control plane has proven
   itself on the two lighter editors.

What each editor needs from this control plane (already in place):
per-user quotas (Premium GPU budget + adjustments), job records (status-only
oversight), audit events (every admin action with reason), plan gates
(FREE vs PREMIUM from the single limits config), and the degrade-honestly
pattern (unpushed schema → honest message, never a dead button).

What stays OUT of every editor phase: any duplication of the clipper's
short-form clip pipeline (moments, captions, vertical renders live in the
clipper repo); any downloader (no fetching video/audio from links, ever);
any copyright promise ("copyright-free", "no strikes" — banned copy);
any invented track, licence, or fingerprint verdict; any bulk processing
without quotas; any paid AI call without the owner's spend approval.

## 4. QA checklist (for the parent's live probe + the owner's hands)

- [ ] Live: `/account` redirects logged-out to `/signin`; `/admin`,
  `/admin/audit`, `/admin/credits` redirect logged-out to `/signin`.
- [ ] Live (after owner pushes schema once): SUPER records a +10 adjustment
  with reason on a test user → adjustment appears on the user page AND
  `/admin/credits` AND the audit trail with the same reason; the user's
  effective Premium budget rises by 10.
- [ ] Live: suspend with reason → audit trail shows the reason; suspend
  without reason → 400 (form blocks it).
- [ ] Live: signed-in user sees ONLY their own jobs/budget on `/account`
  (open two accounts and compare — no cross-user leakage).
- [ ] Live: non-SUPER admin (SUPPORT/FINANCE) can read `/admin/audit` but
  is redirected from `/admin/credits` and cannot POST adjustments.
- [ ] Owner taps still owed (unchanged by this phase): DATABASE_URL +
  per-site TOTP secrets + redeploy for live login; schema push once from
  this repo for adjustments + audit reasons.
- [ ] Owner decision owed: the pre-existing in-app role-change form
  (see audit section) — keep it, or remove it deliberately later.
- [ ] NOT in this phase (next phases, one by one): audio-clean editor,
  photo-to-motion editor, video-enhance editor.
