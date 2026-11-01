// Grayscale gate — a HINT, never a block (2026-11-01 fix).
//
// Faded and sepia old photos carry a warm tint, so a chroma-only
// measurement often reads them as "colour" even though they are
// exactly the photos users want colorized. The old behaviour refused
// colorize on that guess ("looks like a colour photo, nothing to
// colorize") and left the user at a dead end. The new rule:
//
//   - The gate's measurement stays a recommendation in the UI.
//   - The user's explicit "Colorize anyway" choice ALWAYS wins:
//     when colorizeAnyway is true, the server never refuses.
//   - Restore never refuses either way (colour photos skip colorize
//     and go to upscale/cleanup instead).
//
// This module is pure (no Sharp, no DB) so both the server route and
// the unit tests use the same rule.

/** Should the server refuse a colorize job for this photo? */
export function shouldRefuseColorize(opts: {
  isGrayscale: boolean;
  colorizeAnyway: boolean;
}): boolean {
  if (opts.colorizeAnyway) return false;
  return !opts.isGrayscale;
}

/** UI hint text for the gate's measurement (never a refusal). */
export function grayscaleHint(isGrayscale: boolean): string | null {
  if (isGrayscale) return null;
  return "This looks like it already has colour, so colorize may change its colours. If it is actually a faded or sepia old photo, choose “Colorize anyway”.";
}
