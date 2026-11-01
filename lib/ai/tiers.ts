// Free-first tier ordering for server colorize jobs.
//
// There is no browser tier: colorize runs on the server only.
// (The browser model was removed after it kept crashing tabs.)
//
// Server order (FREE + UNLIMITED model, 2026-11-01):
//   Free    -> Space, then Gemini. Free users are NEVER routed to
//             paid GPU (Replicate): every paid-GPU photo bills the
//             owner per run, so sending unlimited free traffic to GPU
//             would drain his money. When the Space is unavailable,
//             free users fall through to Gemini — never to GPU,
//             never to a block.
//   Premium -> Replicate (paid GPU, fast), then Space (free fallback
//             when GPU is unavailable or its budget is reached),
//             then Gemini.
// The Space is the owner's own ZeroGPU Space: free in money, but its
// daily GPU minutes are scarce — when its quota is exhausted, Space
// jobs fail honestly and the user falls through to the next option.
//
// GEMINI EXCEPTION (owner-authorized 2026-11-01, "use Nano Banana
// to colorize"): Gemini Nano Banana (primary gemini-nano-banana-2.1,
// Lite fallback gemini-3.1-flash-lite-image, ~$0.041/image typical
// at 1K on the owner's Gemini bill) IS a paid-per-photo tier, and
// it IS in the free order — because the owner explicitly asked
// for it as the working server path, and because the Space is not
// configured yet, Gemini is the tier that actually runs today.
// Space stays FIRST whenever it is configured, so free money is
// always preferred over paid money. Consequence the owner accepted:
// "free unlimited" server colorize now has a per-photo owner cost
// while the Space is unconfigured — if usage spikes, the next step
// is a cap, not silent billing. Replicate GPU stays Premium-only.
//
// QUOTA NOTE (honest gap, 2026-11-01): when the Space's daily GPU
// minutes run out, Space jobs fail and the order falls through to
// Gemini — there is no quota-specific user message yet, because
// the Space's real quota-exhaustion error text is unverified
// (no Space is live to read it from). Detecting it by guessing a
// string would misfire; the message gets added once the live
// Space's error is seen. The older gemini-2.5-flash-image default
// was retired by this same research round (legacy model).

export type ColorizeServerTier = "space" | "replicate" | "gemini";

export function colorizeAttemptOrder(plan: "FREE" | "PREMIUM"): ColorizeServerTier[] {
  return plan === "PREMIUM" ? ["replicate", "space", "gemini"] : ["space", "gemini"];
}

/** True when this plan may ever run a paid-GPU (image pool) job. */
export function planMayUsePaidGpu(plan: "FREE" | "PREMIUM"): boolean {
  return plan === "PREMIUM";
}
