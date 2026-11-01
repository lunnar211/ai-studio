# DESIGN SYSTEM — AI Studio (single source of truth)

This site already had a coherent identity; the 2026-11-01 redesign pass
systematized it instead of rebranding it. A rebrand (for example to a
generic purple AI palette) would break recognition, the OG images, and
the logo examples for no user benefit. What follows is what every page
must follow. Tokens live in `app/globals.css` (`@theme`); components
must use the token classes, never raw hex values.

## Identity in one line

Warm pink + cream with a cyan accent, serif italic display type, thick
2px borders, 3px corners, no shadows. Friendly and handmade-feeling,
but disciplined: one bold element per page, everything else quiet.

## Tokens (from `app/globals.css`)

| Token | Value | Use |
|---|---|---|
| `--color-brand` | #EC4899 (pink) | Icons, spinners, decorative marks only — never small body text (fails 4.5:1 on white) |
| `--color-brand-dark` | #BE185D (dark pink) | Primary buttons, links, small text accents (passes 4.5:1 on white) |
| `--color-accent` | #0891B2 (cyan) | Focus outline, secondary buttons |
| `--color-accent-dark` | #155E75 (dark cyan) | Secondary button background |
| `--color-cream` | #FDF2F8 | Light page background |
| `--color-line` | #FBCFE8 | Borders (light mode) |
| `--color-muted-fg` | #475569 | Secondary text on light backgrounds (passes 4.5:1 on white; use `dark:text-slate-300` on dark) |
| `--color-destructive` | #DC2626 | Danger buttons, error borders |
| `--font-display` | Playfair Display, Georgia, serif | Page headings (italic, bold) |
| `--font-sans` | Inter, system sans | Body, labels, buttons |

Dark mode: background #1E0A16, foreground #FDF2F8. Every muted-text
line needs its `dark:` override; every card needs `dark:bg-slate-900`.

## Rules (checked by audit, 2026-11-01)

1. **Type:** body 16px, line-height 1.5, always. No body text below
   16px. Display headings use `font-display` italic; never an
   all-caps eyebrow above every heading, never a single accented word
   in a headline.
2. **Touch:** every interactive element is at least 44×44px
   (`min-h-[44px]`). Buttons, inputs, selects, and links all carry it.
   The shared `Button` and `TextInput` components already enforce it.
3. **Focus:** visible focus everywhere — 3px cyan outline, 2px offset
   (`:focus-visible` in globals.css). Never remove focus rings.
4. **Motion:** `prefers-reduced-motion` respected globally (animations
   and transitions collapse to ~0ms). No page-load choreography; motion
   only answers a user action (loading spinners, stage changes).
5. **Layout:** mobile-first, content max-width `max-w-6xl` (tools and
   account pages narrower: `max-w-3xl` / `max-w-xl` where the content
   is a form). No horizontal scroll at 360px — verified by the
   `a11y-mobile` Playwright spec on Home, both tool pages, and a
   landing page. No layout shift: images and loaders reserve space.
6. **Cards:** `border-2 border-line bg-white dark:bg-slate-900`,
   `rounded-[3px]`, no shadows. One border style everywhere — cards do
   not get individual radii or shadows.
7. **Icons:** SVG (Lucide) only, `aria-hidden` when decorative, never
   emoji as icons.
8. **Forms:** visible `Label` for every field (never placeholder-only),
   errors next to the field with `role="alert"` or `role="status"`,
   helper text under the field. Submit buttons say what happens
   ("Generate 3 logo variants", "Sign in with email").
9. **Copy:** plain words, sentence case, one job per element. Prices
   come from Paddle, never invented. Free means free + unlimited on
   the free routes; Premium means faster paid-GPU photo processing +
   HD 4x + face enhance + priority — never "more logos".
10. **Honesty in UI:** no provider, model, or setting names in any
    user-facing response or result UI (admin pages are the exception:
    the owner needs provider names there). No fake results, no dead
    buttons without an explanation, no credit/limit copy on free paths.
11. **No layout shift:** the header, cookie banner, and tool stages
    reserve their space; the logo stage timer and photo progress
    lines never push content around.

## What the redesign pass changed (2026-11-01)

- This document (previously the system was implicit in globals.css).
- One contrast failure fixed: the pricing page's tool link used
  `text-brand` (#EC4899 on white, ~3:1) — now `text-brand-dark`.
  Audit found no other small-text use of `text-brand`, and no raw hex
  in any component.
- Nothing rebranded, no URL changed, no copy model changed: the
  free-unlimited photo model, logo unlimited, 5/min limiter, and
  security headers are all intact (see CHANGELOG).
