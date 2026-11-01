// Free-first tier ordering for server colorize jobs.
//
// Tier A (browser) runs client-side and is NOT in this server order:
// the EnhancerTool tries it first for Free users and last for Premium
// users (as a fallback when both server tiers fail).
//
// Server order:
//   Free    -> Space, then Replicate  (free hardware first, paid last)
//   Premium -> Replicate, then Space  (fast paid GPU first)
// The Space is the owner's own ZeroGPU Space: free in money, but its
// daily GPU minutes are scarce, so server jobs still cost credits.
// Browser colorize is unlimited and costs no credits.

export type ColorizeServerTier = "space" | "replicate";

export function colorizeAttemptOrder(plan: "FREE" | "PREMIUM"): ColorizeServerTier[] {
  return plan === "PREMIUM" ? ["replicate", "space"] : ["space", "replicate"];
}
