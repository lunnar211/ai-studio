// Client-safe colorize constants (no Node imports). The pipeline
// module (lib/ai/colorize.ts) imports sharp, so it can never be
// imported by a client component — these constants live here instead.

export type ColorStyle = "natural" | "vivid" | "warm" | "cool";
export type ColorEra = "" | "1900s-1940s" | "1950s-1970s" | "1980s+";

export const COLOR_STYLES: Array<{ value: ColorStyle; label: string; hint: string }> = [
  { value: "natural", label: "Natural", hint: "Balanced, realistic colours." },
  { value: "vivid", label: "Vivid", hint: "Stronger, more saturated colours." },
  { value: "warm", label: "Warm vintage", hint: "Warmer tones, like an old colour print." },
  { value: "cool", label: "Cool", hint: "Cooler, bluer tones." },
];

export const COLOR_ERAS: Array<{ value: ColorEra; label: string }> = [
  { value: "", label: "No era hint" },
  { value: "1900s-1940s", label: "1900s–1940s" },
  { value: "1950s-1970s", label: "1950s–1970s" },
  { value: "1980s+", label: "1980s and later" },
];
