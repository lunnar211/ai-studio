// Raster image generation (text-to-image) — shared types and size maps.
//
// PROVIDER SPLIT (honest, do not widen it): only Gemini and fal.ai
// can generate raster images on the owner's keys. Groq is a text LLM,
// OpenRouter's image API is paid-only and the owner's key is a
// free-text-tier key, NVIDIA's verified catalogue has no usable
// image-generation model, ElevenLabs is voice-only, Brevo is email.
// Hugging Face is implemented but DISABLED (its token is 401-invalid;
// see huggingface.ts) and never runs unless the owner opts in with
// a fixed token.
//
// COST WARNING: every provider in the chain bills the owner per
// image. Generation is therefore NEVER a free route: the route
// requires sign-in and enforces the daily budget in limits.ts.
// No "free unlimited" copy may ever describe this feature.

export type GenerateSize = "square" | "portrait" | "landscape" | "wide";

export type GenerateProvider = "gemini" | "fal" | "huggingface";

export interface GenerateRequest {
  prompt: string;
  size: GenerateSize;
}

export interface GenerateResult {
  buffer: Buffer;
  mime: string;
  provider: GenerateProvider;
  model: string;
}

/**
 * Size mapping, per provider. Gemini aspect ratios come from the
 * accepted list in lib/ai/adapters/gemini-image.ts; fal image_size
 * values come from fal.ai's own FLUX.1 [schnell] model page
 * (square_hd 1024x1024, portrait_4_3 768x1024, landscape_4_3
 * 1024x768, landscape_16_9 1024x576).
 */
export const GENERATE_SIZE_MAP: Record<
  GenerateSize,
  { label: string; geminiAspect: string; falImageSize: string }
> = {
  square: { label: "Square (1:1)", geminiAspect: "1:1", falImageSize: "square_hd" },
  portrait: { label: "Portrait (3:4)", geminiAspect: "3:4", falImageSize: "portrait_4_3" },
  landscape: { label: "Landscape (4:3)", geminiAspect: "4:3", falImageSize: "landscape_4_3" },
  wide: { label: "Wide (16:9)", geminiAspect: "16:9", falImageSize: "landscape_16_9" },
};

export const GENERATE_SIZES: GenerateSize[] = ["square", "portrait", "landscape", "wide"];
