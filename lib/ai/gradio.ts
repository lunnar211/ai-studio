// Hugging Face Space client (Tier B) — server-only.
//
// NOTE ON TOKEN NAMES (do not conflate them): this Space client uses
// HF_TOKEN (the token the owner sets for his own Space). The registry
// entry "huggingface" is a DIFFERENT, disabled integration (the HF
// Inference API) gated on HF_API_TOKEN + HF_ENABLED — it is NOT used
// by the Space path and must stay disabled until a replacement token
// is verified. The Space's instant kill-switch is the admin
// SiteSetting ai.provider.huggingface = "false" (checked by the
// colorize route and the capabilities endpoint, no redeploy needed).
//
// The owner runs ONE private Gradio Space (his own account, ZeroGPU
// hardware) from DDColor's official Gradio demo. This site calls it
// with the server-side HF_TOKEN only — the token never reaches the
// browser, never appears in logs, and never appears in any file.
//
// Flow (fits the existing poll-driven job machine):
//   start: @gradio/client submit() uploads the image and starts the
//     Gradio job; the returned event id is stored on the PhotoJob
//     (predictionId slot) so polling survives serverless invocations.
//   poll: raw fetch of the Gradio SSE endpoint for that event id.
//     Gradio keeps the event available while the job runs and shortly
//     after it completes; if the event is gone, the job fails honestly
//     with "expired" and the user retries (the next attempt re-runs).
// Cold start: a sleeping Space takes a while to wake. The job stage
// stays "colorizing" and the UI explains the Space may be waking up;
// the 30-minute stuck-job net still applies.
//
// Endpoint names: Gradio shows them in the Space's "Use via API"
// panel (e.g. "/predict"). HF_SPACE_API_NAME overrides the default.
// File outputs arrive as Gradio FileData ({url} and/or {path}); the
// file is fetched server-side with the same token (private Space).

import { Client } from "@gradio/client";

export type SpaceErrorCode =
  | "SPACE_NOT_CONFIGURED"
  | "SPACE_START_FAILED"
  | "SPACE_RESULT_EXPIRED"
  | "SPACE_FAILED";

export class SpaceError extends Error {
  code: SpaceErrorCode;
  constructor(code: SpaceErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function spaceId(): string {
  return (process.env.HF_SPACE_ID ?? "").trim();
}

export function spaceConfigured(): boolean {
  return spaceId().length > 0;
}

function spaceToken(): string {
  return (process.env.HF_TOKEN ?? "").trim();
}

export function spaceApiName(): string {
  const raw = (process.env.HF_SPACE_API_NAME ?? "").trim();
  return raw.length > 0 ? raw : "/predict";
}

/** URL path segment for the Gradio call endpoints (no leading slash). */
function apiNameSegment(): string {
  return spaceApiName().replace(/^\/+/, "");
}

/**
 * Direct host for the Space. HF_SPACE_HOST overrides the derivation
 * (owner/repo -> owner-repo.hf.space) if the Space's host ever differs.
 */
export function spaceHost(): string {
  const override = (process.env.HF_SPACE_HOST ?? "").trim();
  if (override) return override.replace(/\/+$/, "");
  return `https://${spaceId().replace("/", "-")}.hf.space`;
}

function authHeaders(): Record<string, string> {
  const token = spaceToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Start a colorize job on the Space. Returns the Gradio event id.
 * Throws SpaceError (never a raw client error with internals).
 */
export async function startSpaceColorize(image: Buffer, mime: string): Promise<{ eventId: string }> {
  if (!spaceConfigured()) {
    throw new SpaceError("SPACE_NOT_CONFIGURED", "No Hugging Face Space is configured.");
  }
  let app: Awaited<ReturnType<typeof Client.connect>>;
  try {
    const token = spaceToken();
    // @gradio/client types its token as `hf_...`; HF tokens always
    // carry that prefix, so the cast only satisfies the type.
    app = await Client.connect(spaceId(), token ? { hf_token: token as `hf_${string}` } : {});
  } catch {
    throw new SpaceError("SPACE_START_FAILED", "Could not reach the colorize Space (it may be asleep or unreachable).");
  }
  let job: { event_id?: unknown };
  try {
    const blob = new Blob([new Uint8Array(image)], { type: mime });
    // The client takes the endpoint name as shown in the Space's
    // "Use via API" panel (with its leading slash); raw HTTP URLs
    // below use the stripped segment instead.
    job = (await app.submit(spaceApiName(), [blob])) as unknown as { event_id?: unknown };
  } catch {
    throw new SpaceError("SPACE_START_FAILED", "The colorize Space did not accept that photo.");
  }
  const rawId = (job as { event_id?: unknown }).event_id;
  const eventId = typeof rawId === "function" ? String((rawId as () => unknown)()) : typeof rawId === "string" ? rawId : "";
  if (!eventId) {
    throw new SpaceError("SPACE_START_FAILED", "The colorize Space did not return a job reference.");
  }
  return { eventId };
}

export type SpacePoll =
  | { status: "processing" }
  | { status: "succeeded"; image: Buffer }
  | { status: "failed"; message: string };

type FileData = { url?: string; path?: string; orig_name?: string; mime_type?: string };

/** Parse one Gradio SSE stream into its terminal event, if any. */
export function parseSpaceSse(text: string): { event: string; data: unknown } | null {
  const blocks = text.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    let event = "";
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice("event:".length).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trim());
    }
    if (!event) continue;
    if (event === "complete" || event === "error") {
      let data: unknown = null;
      try {
        data = JSON.parse(dataLines.join("\n"));
      } catch {
        data = dataLines.join("\n");
      }
      return { event, data };
    }
  }
  return null;
}

/** Resolve a Gradio FileData output to a fetchable URL. */
export function resolveSpaceFileUrl(file: FileData, host: string): string | null {
  if (file.url) {
    if (file.url.startsWith("http://") || file.url.startsWith("https://")) return file.url;
    if (file.url.startsWith("/")) return `${host}${file.url}`;
    return `${host}/${file.url}`;
  }
  if (file.path) {
    // Gradio paths are absolute (/tmp/gradio/...); keep them verbatim
    // — the file route expects "file=" + the absolute path.
    return `${host}/gradio_api/file=${file.path}`;
  }
  return null;
}

async function fetchSpaceFile(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    throw new SpaceError("SPACE_FAILED", "The colorize Space finished, but its result could not be read.");
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Poll one Space event. Network errors THROW (the job poller treats
 * them as transient and retries); terminal states return a result.
 */
export async function pollSpaceColorize(eventId: string): Promise<SpacePoll> {
  if (!spaceConfigured()) {
    throw new SpaceError("SPACE_NOT_CONFIGURED", "No Hugging Face Space is configured.");
  }
  const url = `${spaceHost()}/gradio_api/call/${apiNameSegment()}/${encodeURIComponent(eventId)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "text/event-stream", ...authHeaders() } });
  } catch {
    throw new Error("Space poll network error (transient).");
  }
  if (res.status === 404 || res.status === 410) {
    return { status: "failed", message: "The Space job expired before its result was collected. Please run it again." };
  }
  if (!res.ok) {
    throw new Error(`Space poll HTTP ${res.status} (transient).`);
  }
  const text = await res.text();
  const terminal = parseSpaceSse(text);
  if (!terminal) return { status: "processing" };
  if (terminal.event === "error") {
    const msg = typeof terminal.data === "string" ? terminal.data : "The colorize Space could not colorize that photo.";
    return { status: "failed", message: msg };
  }
  const outputs = Array.isArray(terminal.data) ? terminal.data : [terminal.data];
  const first = outputs[0] as FileData | string | null;
  if (typeof first === "string") {
    if (first.startsWith("data:")) {
      const base64 = first.split(",")[1] ?? "";
      if (!base64) return { status: "failed", message: "The colorize Space returned an empty result." };
      return { status: "succeeded", image: Buffer.from(base64, "base64") };
    }
    const fileUrl = first.startsWith("http") ? first : first.startsWith("/") ? `${spaceHost()}${first}` : null;
    if (!fileUrl) return { status: "failed", message: "The colorize Space returned an unreadable result." };
    return { status: "succeeded", image: await fetchSpaceFile(fileUrl) };
  }
  if (first && typeof first === "object") {
    const fileUrl = resolveSpaceFileUrl(first, spaceHost());
    if (!fileUrl) return { status: "failed", message: "The colorize Space returned an unreadable result." };
    return { status: "succeeded", image: await fetchSpaceFile(fileUrl) };
  }
  return { status: "failed", message: "The colorize Space returned an unreadable result." };
}
