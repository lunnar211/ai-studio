// Hugging Face adapter — DISABLED by design.
//
// The owner's stored Hugging Face token returns 401 (verified
// 2026-11-01, twice). This adapter exists so the provider can be added
// later by adding an adapter only, but it is DISABLED by default even
// when a token is present: it enables only when HF_ENABLED=true AND
// HF_API_TOKEN are both set. Until the owner checks the token in
// Hugging Face Settings and replaces it, every call through this
// adapter fails closed and the router falls back to the next provider.
// No key value is ever read, printed, or stored here.

import { AiError } from "../types";

export function huggingfaceDisabled(): AiError {
  return new AiError(
    "HF_DISABLED",
    "Hugging Face is disabled: the stored token is not valid. The owner needs to check or replace it first.",
    503
  );
}
