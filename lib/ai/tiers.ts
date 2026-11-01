// Free-first tier ordering for server colorize jobs.
//
// Tier A (browser) runs client-side and is NOT in this server order:
// the EnhancerTool offers it first for Free users and as a fallback
// for Premium users when the server tiers fail.
//
// Server order (FREE + UNLIMITED model, 2026-11-01):
//   Free    -> Space ONLY. Free users are NEVER routed to paid GPU:
//             every paid-GPU photo bills the owner per run, so sending
//             unlimited free traffic to GPU would drain his money.
//             When the Space is unavailable, free users fall back to
//             the free browser path (Tier A) — never to GPU, never to
//             a block.
//   Premium -> Replicate (paid GPU, fast), then Space (free fallback
//             when GPU is unavailable or its budget is reached).
// The Space is the owner's own ZeroGPU Space: free in money, but its
// daily GPU minutes are scarce — when its quota is exhausted, Space
// jobs fail honestly and the user falls through to the next free
// option (browser for Free, Space-then-browser for Premium is NOT
// right either: Premium falls back to Space, then browser).
// Browser colorize is unlimited and costs nothing, for everyone.

export type ColorizeServerTier = "space" | "replicate";

export function colorizeAttemptOrder(plan: "FREE" | "PREMIUM"): ColorizeServerTier[] {
  return plan === "PREMIUM" ? ["replicate", "space"] : ["space"];
}

/** True when this plan may ever run a paid-GPU (image pool) job. */
export function planMayUsePaidGpu(plan: "FREE" | "PREMIUM"): boolean {
  return plan === "PREMIUM";
}
