// Public job state (P0): the ONLY job shape ever sent to a client.
// Whitelist, not blacklist: engine/provider/model are never added
// here, so a future field cannot leak them by accident. Quality is
// the neutral badge the UI shows ("ai" = AI Enhanced, "standard" =
// Standard). Provider/model stay in the database row and server logs
// (admin/debug only), never in a response. Pure + relative imports so
// unit tests can import it (vitest has no `@` alias).
export type PublicJobRow = {
  id: string;
  status: string;
  stage: string;
  mode: string;
  credits: number;
  engine?: string | null;
};

/** Neutral quality badge from the internal engine label. */
export function qualityFor(engine: string | null | undefined): "ai" | "standard" | null {
  if (!engine) return null;
  if (engine.includes("ai")) return "ai";
  return "standard";
}

export function publicJobState(job: PublicJobRow, extra: Record<string, unknown> = {}) {
  return {
    jobId: job.id,
    status: job.status,
    stage: job.stage,
    mode: job.mode,
    credits: job.credits,
    quality: qualityFor(job.engine),
    ...extra,
  };
}
