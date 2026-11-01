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
  PhotoJob + PhotoJob.preUpscaleData): run `prisma db push` ONCE from
  this repo. Until then, colorize endpoints return an honest 503 and
  the UI never offers a dead button.

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
