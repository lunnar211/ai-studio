// Logo generation helpers: system-prompt building, prompt-injection guard,
// model REFUSED detection, and server-side SVG validation. Pure functions
// (unit-tested in tests/logo.test.ts) — no network, no secrets here.
//
// MODEL CHOICE (verified live 2026-11-01 with the new strict prompt):
// openai/gpt-oss-120b is the primary model (larger, ~2.3s per logo, valid
// SVG with brand text, no background rect). openai/gpt-oss-20b (~2.4s,
// same checks passed) is the fallback when the primary fails or 429s.
// llama-3.3-70b-versatile is RETIRED (Groq 404s it) and is never used.
// qwen/qwen3.8-27b is avoided: it caps at 1000 output tokens/min on this tier.

export const LOGO_MODEL_PRIMARY = "openai/gpt-oss-120b";
export const LOGO_MODEL_FALLBACK = "openai/gpt-oss-20b";
// Prompt asks for at most 8 shapes; the server only rejects absurd output
// (over this cap) so ordinary model variation never fails validation.
export const LOGO_MAX_SHAPES = 30;

export const STYLE_RULES: Record<string, string> = {
  flat: "Flat: bold, simple shapes, solid fills, strong silhouette.",
  minimal: "Minimal: lots of negative space, one or two shapes only.",
  geometric: "Geometric: built from circles, triangles and rectangles.",
  badge: "Badge: circular emblem with a clean border ring, symbol centered inside.",
  monogram: "Monogram: abstract letterforms of the brand initials as the symbol, nothing else.",
};

export function buildLogoSystemPrompt(style: string, colors: string, brandName: string): string {
  const rule = STYLE_RULES[style] ?? STYLE_RULES.flat;
  const textRule = brandName
    ? `Brand name in bold sans-serif <text> below the symbol, centered, readable at 32px. The brand name is exactly: ${brandName}.`
    : "No text at all: render the symbol only, no letters, no words.";
  return [
    "You are a professional logo designer. Output ONLY one valid <svg> element and nothing else — no markdown, no fences, no explanation, no extra text.",
    'Canvas: viewBox="0 0 512 512", transparent background (no background rectangle, no full-canvas rect).',
    "Rules:",
    "- At most 8 simple shapes (path, circle, rect, ellipse, polygon, polyline, line).",
    "- At most 3 colors, all from the user's palette.",
    "- One clear central symbol that reads at 32px.",
    "- Keep 40px padding inside the canvas edges.",
    `- ${textRule}`,
    `- Style: ${rule}`,
    "- Completely original geometry. Never copy an existing logo.",
    "- Allowed elements only: svg, g, path, circle, rect, ellipse, polygon, polyline, line, defs, linearGradient, radialGradient, stop, text.",
    "- If the request references a real brand, celebrity, or copyrighted character, output exactly the word REFUSED and nothing else.",
    `Palette: ${colors}.`,
  ].join("\n");
}

// Prompt-injection guard (server-side, applied before the prompt is embedded
// in the model request). Narrow by design: it strips instruction-smuggling
// patterns, not ordinary words. The blocklist still runs on both the
// original and the cleaned prompt, so cleaning never hides a brand term.
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|any\s+|the\s+|previous\s+|above\s+|your\s+)*instructions?/gi,
  /disregard\s+(all\s+|previous\s+|above\s+|your\s+)*instructions?/gi,
  /you\s+are\s+now\b/gi,
  /system\s*:/gi,
  /\[system\]/gi,
  /<\s*\|[^|]*\|\s*>/g,
  /jailbreak/gi,
];

export function cleanPrompt(prompt: string): string {
  let out = prompt;
  for (const re of INJECTION_PATTERNS) out = out.replace(re, " ");
  return out.replace(/\s+/g, " ").trim();
}

// Model-level refusal: the model was instructed to answer exactly REFUSED
// for brand/celebrity/copyrighted requests. Anything containing an <svg>
// is not a refusal, even if the word appears elsewhere.
export function isRefusal(content: string): boolean {
  const text = content
    .trim()
    .replace(/^```(?:svg|xml)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  if (text.includes("<svg")) return false;
  return /^refused\b/i.test(text);
}

export function countShapes(svg: string): number {
  const m = svg.match(/<(path|circle|rect|ellipse|polygon|polyline|line)[\s/>]/g);
  return m ? m.length : 0;
}

// Server-side validation for a SANITIZED svg: starts with <svg, closes
// cleanly, carries the 512 canvas, and is not absurdly complex.
export function validateLogoSvg(svg: string | null): boolean {
  if (!svg) return false;
  const s = svg.trim();
  if (!s.startsWith("<svg")) return false;
  if (!s.includes("</svg>")) return false;
  if (!s.includes("viewBox")) return false;
  if (countShapes(s) > LOGO_MAX_SHAPES) return false;
  return true;
}
