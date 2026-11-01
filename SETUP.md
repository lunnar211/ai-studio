# SETUP.md — activating the free-first tiers (owner steps)

Code is already shipped on the `full-upgrade` branch. Nothing below
needs a code change — only your accounts, keys, and one redeploy.

## 0. What you need before you start

- A Hugging Face account with a **verified email**, **older than 30
  days**, in good standing. Free accounts in good standing can host up
  to 2 ZeroGPU Spaces. If your account is newer than 30 days, ZeroGPU
  hosting is not available yet — wait until it is, or use PRO.
- Vercel access to the `ai-studio` project (Production).
- The one-time database push (covers LogoGeneration + AiUsageLog +
  PhotoJob + PhotoJob.preUpscaleData): it runs ONCE in total across
  both tool sites, never once per site. Coordination rule: the PDF
  Tools Hub agent owns that single push, but only if its schema
  matches this repo's and a database URL is already present locally;
  otherwise the push is your tap (run it once from your machine with
  the pooler connection string, §6 step 3). This repo never pushes.
  Until the push lands, history/account/checkout endpoints return an
  honest message and the tools never offer a dead button.

## 1. Create your own colorize Space (Tier B)

No suitable pre-existing public DDColor Space was verified, so Tier B
is a fresh Space built from DDColor's own official Gradio demo (its
existence and launch command are verified in the DDColor README).

1. On Hugging Face: **New Space**.
   - Name: e.g. `ai-studio-colorize` (the Space id becomes
     `your-username/ai-studio-colorize`).
   - SDK: **Gradio**.
   - Hardware: **ZeroGPU** (this is the free path — free accounts can
     no longer create ordinary CPU Spaces; ZeroGPU is Gradio-only).
   - Visibility: **Private** (recommended — a public Space lets
     anyone burn your daily GPU minutes).
2. Upload the demo: from the DDColor repo (`piddnad/DDColor`), take
   the `demo/` folder's Gradio app (`demo/gradio_app.py` — the README
   launches it with `python demo/gradio_app.py` after
   `pip install gradio gradio_imageslider`). Upload it as **`app.py`**
   (HF Spaces run `app.py` by default) plus a `requirements.txt`.
   - If the repo's demo folder already ships a requirements file, use
     it. Otherwise start with `gradio`, `gradio_imageslider`, `torch`,
     `torchvision` and add whatever the Space build log says is
     missing — the build log names missing packages; add them and
     rebuild. (This guide does not invent a dependency list the demo
     was not verified against.)
3. Wait until the Space status is **Running**. Test it in the Space
   UI with a black & white photo.
4. Open the Space → **"Use via API"** and note:
   - the endpoint name (usually `/predict`);
   - whether the endpoint takes anything besides the image. This
     site sends exactly one input (the image) and reads the **first**
     output as the colorized image. If your demo's first output is a
     comparison view rather than the plain colorized image, tell the
     agent — that is a one-line code change (output index), not a
     reason to rebuild the Space.

## 2. Vercel env vars (ai-studio project, Production) + redeploy

Names only — paste values from your own provider dashboards, never
from chat:

| Variable | Value (from) |
|---|---|
| `HF_TOKEN` | Hugging Face → Settings → Access Tokens. A token that can read your private Space (fine-grained, scoped to that Space, is the tightest choice). Server-only — never in client code. |
| `HF_SPACE_ID` | Your Space id, e.g. `your-username/ai-studio-colorize`. |
| `HF_SPACE_API_NAME` | Only if the "Use via API" name is not `/predict`. |
| `HF_SPACE_HOST` | Only if the Space host differs from `owner-repo.hf.space`. |
| `REPLICATE_API_TOKEN` | Replicate dashboard (Tier C). Legacy single key — still works; it is appended to the pool automatically. |
| `AI_API_KEYS` | Replicate dashboard (Tier C). Comma-separated IMAGE-provider keys (Replicate tokens first). The pool rotates round-robin and fails over on 429/401/402/5xx. Never put LLM/text keys here. |
| `REPLICATE_COLORIZE_MODEL` (+ optional `_VERSION`) | Replicate model slug for colorize, e.g. `piddnad/ddcolor`. Empty = colorize via Space/browser only. |
| `REPLICATE_UPSCALE_MODEL` (+ optional `_VERSION`) | Replicate model slug for upscale, e.g. `nightmareai/real-esrgan`. Empty = Sharp fallback only. |
| `REPLICATE_RESTORE_MODEL` (+ optional `_VERSION`) | Replicate model slug for restore, e.g. `tencentarc/gfpgan`. Empty = restore step skipped with an honest notice. |
| `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `NVIDIA_API_KEY`, `ELEVENLABS_API_KEY` | Each provider's dashboard (Phase 0 adapters; paste + redeploy to activate). |
| `GROQ_API_KEY` | Already set in Production (logo + STT). Do not overwrite. |

Then **redeploy** the ai-studio project. Do NOT set `HF_ENABLED=true`
or `HF_API_TOKEN` for the Space — those belong to the separate,
disabled HF Inference adapter, which stays disabled until a
replacement token is verified (its vault token returns 401).

## 3. Verify Tier B works

1. `GET /api/photo/capabilities` returns `"spaceConfigured": true`.
2. On `/photo-enhancer`, choose **Colorize**, upload a black & white
   photo, and use **server colorize**. (Free users: the server path
   tries the Space first.)
3. The result should carry the neutral quality badge ("AI Enhanced")
   and the note that colours are estimated. It must NOT name a
   provider, model, or setting anywhere in the result UI or the
   network response (P0 privacy rule) — the provider/model live only
   in the server usage log, which is what step 4 checks.
4. `/admin/ai-health` shows the Space job in the usage log (cost $0 —
   ZeroGPU minutes, not dollars).

## 4. ZeroGPU quota — the honest limit

- Free account: **5 GPU-minutes per day**, resetting 24 hours after
  your first GPU use that day. PRO: 40 minutes/day.
- When the quota is exhausted, Space jobs fail and the site falls
  through honestly: Premium → Replicate (paid-GPU route); Free →
  the free browser path. Free users are NEVER routed to Replicate —
  every paid-GPU photo would bill the owner, so the free fall-through
  is the browser path only. Nothing is faked and no job hangs (the
  30-minute stuck-job net still applies).
- Kill-switch: Admin → Settings → `ai.provider.huggingface` =
  `false` disables the Space instantly, no redeploy.

## 5. Manual browser test (Tier A) — do this once in a real browser

Automated tests cover the tensor math, but a real browser run needs
your browser + internet (the sandbox cannot download the model file
or run a live browser):

1. Open `/photo-enhancer` → **Colorize** → upload a black & white
   photo → **"Colorize free in browser"**.
2. You should see a one-time download progress line: "Downloading
   the colorize model (one-time) — X MB of ~64 MB
   (Y%)". After it finishes, the model is cached on your device.
3. The result should appear with the neutral quality badge ("AI
   Enhanced") and the note that the photo never left your device.
   It must NOT name a provider, model, or setting (P0 privacy rule).
4. Fallback check: block the model URL in devtools (or go offline
   before the first download) and run again — you should get an
   honest error offering server colorize, never a fake result.
5. Known Tier A limits: output capped at 2048px; colour style/era do
   not apply (DeOldify takes no style input); the browser path is
   offered for plain Colorize and for black & white Restore (colorize
   only — model face/scratch repair stays server, because the browser
   model cannot do it). Colour Restore stays server/Enhance.

## 6. Every remaining setup tap — one checklist (all gates)

Every "not set up yet" message on the site maps to exactly one row
below. Nothing here needs a code change, and no value is invented:
paste each value from its own dashboard, then redeploy. Work top to
bottom; each row says what visitors see until it is done.

1. **Sign-in (login service)** — what visitors see until done:
   "Sign-in is not set up yet" on `/signin`, with the guest tools
   still working.
   - Vercel → `ai-studio` project → Settings → Environment
     Variables → add `NEXT_PUBLIC_SUPABASE_URL` and
     `NEXT_PUBLIC_SUPABASE_ANON_KEY` for **Production AND Preview**.
     Values: Supabase dashboard → Project Settings → API (the
     existing LeadForge project — the same one LeadsForceGen uses;
     no new project).
   - Supabase dashboard → Authentication → Providers → **Google**:
     confirm it is enabled.
   - Supabase dashboard → Authentication → URL Configuration →
     Redirect URLs → add
     `https://ai-studio-sandy-sigma.vercel.app/auth/callback`.
   - Vercel → Deployments → **Redeploy** (env changes need a
     redeploy to go live).
2. **Database connection (Vercel side)** — what visitors see until
   done: "The database is not configured yet" on account/history
   pages; the tools still work as guest tools.
   - Vercel → `ai-studio` project → Settings → Environment
     Variables → add `DATABASE_URL` for Production AND Preview.
     Value: Supabase dashboard → Project Settings → Database →
     connection string (use the pooler / transaction-mode string,
     which is the one made for serverless hosting).
   - Redeploy (same as step 1).
3. **ONE database schema push** — what visitors see until done:
   "Logo history is not available yet: the database needs one
   schema update"; generations still work, they just are not saved.
   - Coordination rule (do not run this twice): the single push
     comes from THIS repo's schema (ai-studio's is the superset —
     it alone has the logo/photo tables), once, from your machine
     with the pooler connection string from step 2. PDF Tools Hub
     must never push afterward (a push from there would treat the
     ai-studio-only tables as removed).
   - After the push, sign in and check `/account`: logo history,
     photo jobs, and export/delete work.
4. **Admin allowlist + two-factor** — what the admin sees until
   done: the admin pages refuse non-allowlisted sign-ins, and
   `/admin/setup-2fa` reports two-factor is not set up.
   - Vercel → `ai-studio` project → Settings → Environment
     Variables → add `ADMIN_EMAILS` (your admin email address)
     and a fresh `TOTP_SECRET` for Production AND Preview. Never
     reuse a password or secret that was ever pasted in chat.
   - Redeploy, sign in with Google, then open
     `/admin/setup-2fa` and complete the authenticator setup.
   - **Email + password sign-in (optional, for admin accounts):**
     Supabase dashboard → Authentication → Providers → **Email**:
     confirm it is enabled. Then Authentication → Users → **Add
     user**: create the admin user with a fresh password you never
     share in chat (the site has no self-service password signup;
     accounts are created by you here). That user then signs in on
     `/signin` with email + password, alongside Google. For admin
     rights, the user's email must also be in `ADMIN_EMAILS`
     (first allowlisted login becomes ADMIN + SUPER automatically,
     or a SUPER grants the role on `/admin/users`). Two-factor
     stays mandatory for `/admin` whichever way the admin signed in.
5. **Premium checkout (Paddle)** — what visitors see until done:
   the Pricing page says checkout is not configured yet and shows
   no Upgrade button; every free tool still works.
   - Paddle dashboard → create the product + monthly/yearly
     prices → note the price IDs.
   - Paddle dashboard → Developers → Webhooks → add
     `https://ai-studio-sandy-sigma.vercel.app/api/webhooks/paddle`.
   - Vercel → `ai-studio` project → Settings → Environment
     Variables → add `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`,
     `PADDLE_PRICE_ID` (and the yearly price ID), with
     `PADDLE_ENV=sandbox` first for testing.
   - Redeploy, then run a sandbox checkout before switching
     `PADDLE_ENV` to production.
6. **Paid-GPU photo routes (optional, Premium only)** — what
   visitors see until done: server colorize/restore offer the free
   browser path or free Enhance instead; nothing is faked.
   - Replicate dashboard → API tokens → `AI_API_KEYS`
     (comma-separated image-provider keys only — never text/LLM
     keys) and/or `REPLICATE_API_TOKEN`, plus the model slugs in
     §2 (`REPLICATE_COLORIZE_MODEL`, `REPLICATE_UPSCALE_MODEL`,
     `REPLICATE_RESTORE_MODEL`). Verify each model slug on
     Replicate first; an unverified slug stays empty.
   - Vercel env + redeploy (same as step 1).
7. **Free server colorize (Space)** — see §1–§2 above
   (`HF_TOKEN` + `HF_SPACE_ID` in Vercel + redeploy). Until done,
   the free browser path is the working free colorize route.
8. **Contact fallback address (optional)** — what visitors see
   until done: the contact form sends to the support inbox when it
   is configured, and otherwise says plainly to try again later.
   - Vercel → `ai-studio` project → Settings → Environment
     Variables → add `NEXT_PUBLIC_CONTACT_EMAIL` (an address you
     monitor) to also offer the "open your email app" fallback on
     `/contact`. Redeploy.

## 7. Owner preview checklist — large photos, colorize, Admin link (branch preview)

Run these on the branch preview after merge approval (the preview
is rebuilt on every push; use the newest deployment URL Vercel
shows for the `full-upgrade` branch). None of these were verified
by the builder — the sandbox has no internet for the browser model
and no access past Deployment Protection.

1. **Large phone photo enhances (the 413 fix):** open
   `/photo-enhancer`, choose Enhance, and upload a real phone photo
   over 4 MB (a 6–12 MB photo is the test). It must NOT show a
   generic failure. You should see the note that the photo was
   compressed in your browser for upload, and then the enhanced
   result. A photo under 4 MB must upload with no compression note.
2. **Forced failure shows the new plain message:** if an upload
   still fails, the message must name the problem in plain words
   (too large / connection broke), never a bare generic failure and
   never a provider, model, or setting name.
3. **Black-and-white photo actually comes back colored:** open
   `/photo-enhancer`, choose Colorize, and upload a real
   black-and-white photo. The free browser path is the primary free
   route: the first run downloads the colorize model once (~64 MB)
   and caches it on your device, so allow that download. The result
   must be a genuinely colored photo — not a tint or sepia filter.
   If browser colorize fails on your device, the error must offer
   server colorize as a button (when the server is set up) or free
   Enhance — never a dead end. If server colorize fails, it must
   offer browser colorize. Server colorize itself needs the Space
   (§1) or paid-GPU keys (§6, step 6) — until then, browser colorize
   is the working free colorize route.
4. **Mode labels are honest:** Enhance says sharper and cleaner
   with the same colours (it must NOT claim to add colour); a
   black-and-white photo in Enhance mode suggests Colorize.
5. **Admin link is visible:** the site footer (every page) shows an
   "Admin" link, and the header shows "Admin" when you are signed
   in. Clicking it while signed out must bounce to sign-in; opening
   `/admin` on live still needs your taps (Supabase env + redirect
   + redeploy + the one schema push in §6 step 3 + TOTP setup) —
   the link alone does not log anyone in, and the admin pages still
   require admin role + fresh two-factor code.
