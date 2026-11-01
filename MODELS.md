# MODELS.md — every model this site runs, where it runs, and its licence

Rule (from the brief): **only models whose licence allows use on a site
with a paid plan may serve Premium paths.** A licence that forbids
commercial use excludes the model from Premium entirely; an unverified
licence is recorded as UNVERIFIED, never assumed. Licences below were
verified 2026-11-01 from each project's own source (repo LICENSE /
sidebar / README), not from secondary summaries.

## Colorize

| Model | Version / file | Where it runs | Licence (verified) | Serves |
|---|---|---|---|---|
| DDColor | `ddcolor_modelscope` (default) / `large` on Replicate; HF `piddnad/ddcolor_modelscope`, `ddcolor_paper`, `ddcolor_artistic`, `ddcolor_paper_tiny` | Tier C: Replicate `piddnad/ddcolor`; Tier B: owner's HF Space from the official Gradio demo | **Apache-2.0** — GitHub repo sidebar "License: Apache License 2.0 (Apache-2.0)" + LICENSE file in repo root (verified firsthand 2026-11-01; the README itself has no licence section, the repo LICENSE governs). No separate weights licence statement was found; weights ship from the same project (HF `piddnad/ddcolor_*`, ModelScope `damo/cv_ddcolor_image-colorization`). | Free + Premium |
| DeOldify (browser ONNX) | `deoldify.quant.onnx` — INT8-quantized export, ~25 MB (from ~100 MB), `linmingren/openmodels` | Tier A: visitor's browser via ONNX Runtime Web (WebGPU, WASM fallback), Web Worker | **MIT** — DeOldify repo LICENSE file + GitHub sidebar "License: MIT License (MIT)" (verified firsthand 2026-11-01; repo archived 2024-10-19). Caveat: the ONNX file is a *community conversion*, not an official DeOldify release — quality may differ slightly from the PyTorch model, and the conversion itself carries no separate licence. | Free + Premium (browser path is free for everyone; Premium users reach it only as a fallback) |

DDColor browser availability: **NOT established.** The official repo
supports ONNX *export* (`scripts/export_onnx.py`, opset 12) and an
ONNX Runtime notebook demo, but no verified browser-hosted DDColor
ONNX file or browser demo was found. Browser colorize therefore uses
DeOldify, and DDColor stays on Tier B/C. Do not wire a DDColor browser
build until a real file URL + hash is verified.

## Upscale / restore

| Model | Version / file | Where it runs | Licence (verified) | Serves |
|---|---|---|---|---|
| Real-ESRGAN | `nightmareai/real-esrgan` on Replicate (inputs: image, scale, face_enhance); weights: official v0.1.0 releases (x4plus etc.) | Tier C: Replicate (2x/4x, face_enhance toggle) | **BSD-3-Clause** — official repo licence (multiple secondary sources agree; the repo's LICENSE is BSD-3-Clause). Commercial use allowed. | Free (2x) + Premium (2x/4x) |
| Real-ESRGAN (browser) | `realesr-general-x4v3` compact model (SRVGGNetCompact, ~4.9 MB fp32 / ~2.4 MB fp16) — described in an in-browser WebGPU write-up | **NOT WIRED.** No verified hosted ONNX download URL for this model was found (the write-up's team exported it themselves and published no file). Do not guess a URL. | BSD-3-Clause (same as above) — licence is fine; the blocker is purely the missing verified file. | — |
| GFPGAN | v1.3 (`GFPGANv1.3.pth`) / v1.4, inside Replicate Real-ESRGAN's `face_enhance` | Tier C only, as the face path inside Real-ESRGAN (no separate GFPGAN model is wired) | **Apache-2.0** — GFPGAN README badge + "GFPGAN is released under Apache License Version 2.0" (verified firsthand 2026-11-01). | Premium (face enhance) |
| GFPGAN (browser) | `GFPGANv1.3.onnx` / `v1.4.onnx` (512×512, third-party conversions) | **NOT WIRED.** No official browser GFPGAN build was verified; face restore in browser is not established as sound. Route to Tier B/C. | Apache-2.0 (code, per README) — but a browser build would still need its own file verification. | — |
| CodeFormer | — | **NOT WIRED, deliberately.** | **S-Lab License 1.0, NON-COMMERCIAL** (verified via the project's own page, Oct 2026). CodeFormer must NOT serve any path on this site (Free or Premium) because the site has a paid plan. If the owner wants it, he needs a commercial arrangement — until then it stays out. Authors state only the HF Space, Replicate, and OpenXLab demos are official. | — |

## Text / vision / speech (Phase 0 providers)

These are API providers, not weights shipped here; their terms are the
provider's API terms (no training on API data is claimed only where
the provider states it — see Privacy Policy). Keys are env-gated;
nothing is sent to a provider whose key is absent.

| Provider | Models wired | Licence/terms note |
|---|---|---|
| Groq | `openai/gpt-oss-120b` (logo primary), `openai/gpt-oss-20b` (fallback), `whisper-large-v3-turbo` (STT) | Free tier. `llama-3.3-70b-versatile` is RETIRED — never use. |
| Gemini | `gemini-3.8-flash` (text + vision) | `gemini-2.0-flash` is RETIRED — never use. |
| OpenRouter | `liquid/lfm-2.5-2.6b:free` default (env-overridable) | Free-tier models; congestion falls back to Groq. |
| NVIDIA | `meta/llama-3.2-11b-vision-instruct` (vision), `nvidia/llama-3.1-nemoguard-8b-content-safety` (text moderation) | No image model in this catalogue — never use NVIDIA for images. |
| ElevenLabs | Sarah voice `EXAVITQu4vr4xnSDxMaL` (public voice id) | TTS adapter ready; no UI feature forces its use. |
| Hugging Face Inference | — | **DISABLED.** Vault token returns 401. Needs owner token check/replace; `HF_ENABLED=true` only after verification. Separate from the Tier B Space (which uses HF_TOKEN). |

## Tier / provider routing (summary)

- Colorize, Free: **A** (browser DeOldify, unlimited, no credits) → **B** (own Space, 2 credits) → **C** (Replicate DDColor, 2 credits).
- Colorize, Premium: **C** (Replicate DDColor, 2 credits) → **B** (Space, 2 credits) → **A** (browser DeOldify, free fallback).
- Colorize + HD / Restore: server only (**C** Real-ESRGAN upscale, or **B** colorize + **C** upscale; Sharp standard-quality fallback for the upscale step only, labelled honestly). Browser colorize has no HD/face path.
- Enhance only: **C** Real-ESRGAN (1 credit) → Sharp standard fallback (labelled).
- Face enhance: **C** Real-ESRGAN `face_enhance` (GFPGAN inside), Premium only.

## Retention (what each hop keeps)

- Browser (Tier A): nothing leaves the device; the model file is
  cached in the visitor's browser (Cache API) after the first ~25 MB
  download. No server copy exists.
- Space (Tier B): the photo is sent to the owner's own Space; the
  Space processes it and returns the result. Job inputs/results live
  in the site's database only until the job ends (input cleared at
  terminal state, result cleared after 2 hours). HF's own retention
  for Space traffic follows Hugging Face's terms — the site makes no
  deletion claim it cannot prove.
- Replicate (Tier C): see Privacy Policy — Replicate's policy (Apr 1
  2026) states no fixed deletion period, only "as long as necessary
  to provide the Services" plus legal/abuse retention and limited
  backup copies. The site states exactly that and links the policy.
