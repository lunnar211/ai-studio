# n8n — Photo Colorize Worker

Ready-to-import n8n workflow for AI Studio photo colorize. It does the
server-side colorize job that the phone browser cannot do safely: the
phone uploads a photo, a server colors it, the phone only downloads
the result. No heavy model ever runs on the phone.

**File:** `photo-colorize-worker.json` — import it in n8n (Workflows →
Import from File). It contains NO keys, tokens, or secrets: every
credential is read from the n8n host's environment (`$env`) at run
time. Never paste a real key into this file, and never share an
export taken from a live n8n that embeds credentials.

## What it does

```
POST /webhook/photo-colorize  →  check secret  →  validate photo
  →  HF Space (DDColor)  →  Gemini Nano Banana  →  Replicate DDColor
  →  JSON answer
```

Order matches the site's tiers: the free Space first, then Gemini,
then Replicate. A branch that is unconfigured is skipped, a branch
that fails falls through to the next one. Poll loops are capped
(Space 30 × 10s, Replicate 40 × 10s) and then fall through too —
a stuck provider never hangs the workflow forever.

The workflow returns the model's RAW color output. It does NOT do
the site's Lab merge (original detail + model color) or the upscale:
the site keeps those steps, exactly as its own server path does.
That is deliberate — the merge is tested site code, and duplicating
it inside n8n would create two versions of the truth.

## Input (what the caller sends)

POST JSON to `https://<your-n8n-host>/webhook/photo-colorize`
(use the production `/webhook/` URL with the workflow ACTIVE, not
the `/webhook-test/` URL):

```json
{
  "imageBase64": "<base64 JPEG/PNG/WebP, site pre-sized to max 1536px>",
  "mime": "image/jpeg"
}
```

Header (required, fail-closed — a missing or wrong secret is
rejected and the workflow never runs):

```
x-n8n-secret: <the secret you set in n8n's environment>
```

## Output (what the caller gets back)

Success:

```json
{
  "ok": true,
  "provider": "huggingface | gemini | replicate",
  "model": "<space id | gemini model | replicate model>",
  "imageBase64": "<base64 model output>",
  "mime": "image/png"
}
```

All branches failed (generic on purpose — no provider or
configuration names leak to the caller):

```json
{
  "ok": false,
  "error": "Colorize is unavailable right now. Try the free browser colorize instead, or use Enhance only.",
  "freeAlternative": "browser"
}
```

Note: `provider`/`model` in this answer are server-to-server
only. The site must strip them before responding to the browser,
the same way its own job API never exposes provider or model.

## Environment variables (set on the n8n host, never in chat)

| Variable | Needed for | Notes |
|---|---|---|
| `N8N_COLORIZE_SECRET` | All calls | **Required.** Any value you choose; the caller must send the same value in `x-n8n-secret`. |
| `HF_SPACE_ID` | Space branch | Your Space id, e.g. `owner/repo`. Empty = Space branch skipped. |
| `HF_TOKEN` | Space branch | Read-scoped token for your own (private) Space. |
| `HF_SPACE_HOST` | Space branch | Optional. Defaults to `owner-repo.hf.space` derived from the id. |
| `HF_SPACE_API_NAME` | Space branch | Optional, default `/predict`. **Confirm it in your Space's "Use via API" panel** — do not assume it. |
| `GEMINI_API_KEY` | Gemini branch | Paid billing, no free tier. Empty = Gemini branch skipped. |
| `GEMINI_IMAGE_MODEL` | Gemini branch | Optional, default `gemini-nano-banana-2.1`. |
| `REPLICATE_API_TOKEN` | Replicate branch | Empty = Replicate branch skipped. |
| `REPLICATE_COLORIZE_MODEL` | Replicate branch | Model slug, e.g. the DDColor model. |
| `REPLICATE_COLORIZE_VERSION` | Replicate branch | **Exact version hash from the model's Replicate page.** It is NOT in this file and must not be guessed. |

## Space setup notes (read before importing)

- The Space must be your own DDColor Space. Duplicating the
  upstream demo verbatim does NOT give you a ZeroGPU Space: the
  demo has no GPU setting in it. The Space's own code needs the
  GPU decorator for its endpoint, or the Space will not run on
  free GPU hardware.
- Free Hugging Face accounts get a small daily GPU allowance
  (about 5 GPU-minutes a day at research time), so the Space
  branch is capped by that allowance, not unlimited. When it is
  used up, the workflow falls through to Gemini automatically.
- The workflow uploads the photo to the Space's upload endpoint,
  starts the endpoint, then polls its event stream until the
  result file arrives. If your Space's Gradio version answers
  uploads or events differently, check the "Use via API" panel
  first — that panel is the truth for your Space.

## Gemini notes

- The prompt asks for natural, realistic color and for nothing
  else to change. The site's Lab merge afterwards keeps the
  original detail, so even if the model shifts shading, faces
  and texture stay original.
- Budget roughly $0.04–0.05 per photo at 1K output (research
  time). There is no free tier for image models, so every Gemini
  photo bills your Google account.
- Gemini sometimes refuses photos of people. That is why
  Replicate DDColor sits after it: a refusal falls through to
  the non-generative colorizer instead of failing the job.

## Oracle host steps (his taps, in order)

1. Finish the Oracle signup and create the VM (Mumbai preferred).
2. Install n8n on it (npm or Docker) and run it as a service so
   it restarts on its own.
3. Set the environment variables above in n8n's own environment
   (typed on the machine, never in chat).
4. Put n8n behind HTTPS with a domain name — the site can only
   call a secure webhook address.
5. Keep the n8n editor behind its login. Never expose the editor
   or this workflow's exports publicly.
6. Import this file, set the variables, activate the workflow,
   and test it with a real black-and-white photo (see below).

## Testing checklist (after import, before wiring the site)

- Small black-and-white photo + correct secret → color photo
  back, `ok: true`.
- Wrong secret → 401, nothing runs.
- Oversized or non-photo input → 400, generic message.
- Space variables empty → Gemini answers (Space skipped).
- Gemini key empty → Replicate answers (Gemini skipped).
- All three empty → 503 with the generic message, no provider
  or configuration names in the answer.
- Poll loops: a sleeping Space takes a while to wake; the
  workflow waits and retries instead of failing fast. n8n may
  show a loop warning on the Wait-back connections — that is
  expected, the attempt caps stop it.

## What this delivery does NOT do (honest scope)

- It does not change the live site. The site still uses its own
  server tiers today.
- It does not run anywhere until the Oracle host exists.
- The next step, once the host is live and the webhook passes
  the checklist above, is a small site change: a new
  `N8N_COLORIZE_WEBHOOK_URL` + `N8N_COLORIZE_SECRET` setting on
  the site and a code path that posts colorize jobs to n8n and
  merges the returned output with the existing Lab merge and
  upscale. That wiring comes after the host, not before — wiring
  it now would point the live site at a webhook that does not
  exist yet.
