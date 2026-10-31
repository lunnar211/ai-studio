# AI Studio

Free AI tools: an original logo generator and a photo enhancer. Next.js App Router +
TypeScript + Tailwind CSS v4, with hand-rolled shadcn-style components in `components/ui`.

## Routes

| Route | What it does |
| --- | --- |
| `/` | Home: hero, tool cards, how-it-works, FAQ, trust, premium, other projects |
| `/logo-generator` | AI logo generator (SVG preview, SVG + 1024px PNG download) |
| `/photo-enhancer` | Photo enhancer (drag-and-drop, real upload progress, before/after slider, PNG download) |
| `/about`, `/contact`, `/privacy`, `/terms`, `/disclaimer` | Content and policy pages |

## API routes

| Route | Behaviour |
| --- | --- |
| `POST /api/logo/generate` | Zod-validated `{prompt, style, colors}`. Groq `llama-3.3-70b-versatile` returns SVG only; output is whitelist-sanitized server-side. Brand/celebrity prompts refused (400). Without `GROQ_API_KEY` returns an honest 503 — never a fake logo. |
| `POST /api/logo/png` | Sanitizes the supplied SVG again, rasterizes with Sharp at 1024px, transparent background. |
| `POST /api/enhance` | Multipart image, magic-byte validated JPG/PNG/WebP, max 10 MB. Replicate `nightmareai/real-esrgan` when `REPLICATE_API_TOKEN` is set and succeeds (labelled `ai`); otherwise Sharp 2x lanczos3 + sharpen + normalize (labelled `sharp`, never claimed as AI). |

## Honest launch states

- **No Groq key** → logo generation returns 503 and the page shows that message. No fake logo.
- **No Replicate token (or Replicate failure)** → enhancer uses Sharp and the UI clearly says
  “Enhanced (standard quality — set REPLICATE_API_TOKEN for AI upscaling)”.
- **No Turnstile keys** → tools work without captcha. Set both keys to enable bot protection.
- **No Upstash keys** → in-memory per-IP rate limiting (10/day per AI tool). It does not persist
  across serverless instances; set Upstash keys for a distributed limiter.
- **No premium checkout URL** → the premium section shows “not available yet” and renders no
  actionable payment button. No payment details are collected anywhere.
- **No AdSense publisher ID** → the ad slot renders nothing. Never enable ads before approval.
- **No contact email** → the contact page shows “contact email not configured yet” and disables the button.

## Environment variables

See `.env.example` for the full list with placeholders only:

- `GROQ_API_KEY` (server-only, required for AI logos)
- `REPLICATE_API_TOKEN` (server-only, optional — enables AI upscaling)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (optional — distributed rate limiting)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (optional — bot protection)
- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SISTER_SITE_URL` (default `https://pdf-tools-hub.vercel.app`),
  `NEXT_PUBLIC_LEADSFORCEGEN_URL` (default `https://leadsforcegen.vercel.app`),
  `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_PREMIUM_CHECKOUT_URL`,
  `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` (all optional/public)

## Security

- Zod on every endpoint; file type checked by MIME **and** magic bytes; filenames sanitized.
- SVG output whitelist-sanitized (no `script`, `foreignObject`, event handlers, `href`, or external references).
- Security headers in `next.config.ts`: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy.
- Error responses are generic only — no stack traces, secrets or internal paths.
- Uploads are processed in memory and never persisted or publicly listed.
- Files are deleted immediately after processing (max 60 minutes in any case) — stated on each tool page.

## Moderation

- Logo prompts: keyword blocklist (~90 terms: major brands, characters, celebrity names),
  case-insensitive substring match, clean 400 on refusal; prompt capped at 300 characters.
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
