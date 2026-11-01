// Free-first tier ordering for server colorize jobs.
//
// Tier A (browser) runs client-side and is NOT in this server order:
// the EnhancerTool offers it first for Free users and as a fallback
// for Premium users when the server tiers fail.
//
// Server order (FREE + UNLIMITED model, 2026-11-01):
//   Free    -> Space, then Gemini. Free users are NEVER routed to
//             paid GPU (Replicate): every paid-GPU photo bills the
//             owner per run, so sending unlimited free traffic to GPU
//             would drain his money. When the Space is unavailable,
//             free users fall back to the free browser path (Tier A)
//             — never to GPU, never to a block.
//   Premium -> Replicate (paid GPU, fast), then Space (free fallback
//             when GPU is unavailable or its budget is reached),
//             then Gemini.
// The Space is the owner's own ZeroGPU Space: free in money, but its
// daily GPU minutes are scarce — when its quota is exhausted, Space
// jobs fail honestly and the user falls through to the next option.
// Browser colorize is unlimited and costs nothing, for everyone.
//
// GEMINI EXCEPTION (owner-authorized 2026-11-01, "use Nano Banana
// to colorize"): Gemini Nano Banana (gemini-2.5-flash-image) IS a
// paid-per-photo tier (~$0.039/image on the owner's Gemini bill),
// and it IS in the free order — because the owner explicitly asked
// for it as the working server path, and because the Space is not
// configured yet, Gemini is the tier that actually runs today.
// Space stays FIRST whenever it is configured, so free money is
// always preferred over paid money. Consequence the owner accepted:
// "free unlimited" server colorize now has a per-photo owner cost
// while the Space is unconfigured — if usage spikes, the next step
// is a cap, not silent billing. Replicate GPU stays Premium-only.

export type ColorizeServerTier = "space" | "replicate" | "gemini";

export function colorizeAttemptOrder(plan: "FREE" | "PREMIUM"): ColorizeServerTier[] {
  return plan === "PREMIUM" ? ["replicate", "space", "gemini"] : ["space", "gemini"];
}

/** True when this plan may ever run a paid-GPU (image pool) job. */
export function planMayUsePaidGpu(plan: "FREE" | "PREMIUM"): boolean {
  return plan === "PREMIUM";
}
