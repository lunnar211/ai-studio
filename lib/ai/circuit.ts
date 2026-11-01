// Circuit breaker: after repeated failures (or 429s) a provider is
// skipped for 5 minutes so one sick provider cannot stall every request.
// In-memory only (serverless instances each keep their own breaker);
// this is a latency guard, not a correctness guarantee.

const WINDOW_MS = 5 * 60 * 1000;
const FAIL_THRESHOLD = 3;
const SKIP_MS = 5 * 60 * 1000;

type State = { failures: number[]; skipUntil: number };
const states = new Map<string, State>();

function stateFor(key: string): State {
  let s = states.get(key);
  if (!s) {
    s = { failures: [], skipUntil: 0 };
    states.set(key, s);
  }
  return s;
}

/** True when the provider is currently skipped by the breaker. */
export function isTripped(provider: string): boolean {
  return stateFor(provider).skipUntil > Date.now();
}

/** Record a failure. A 429 counts double (it signals overload). */
export function recordFailure(provider: string, rateLimited = false): void {
  const s = stateFor(provider);
  const now = Date.now();
  s.failures = s.failures.filter((t) => now - t < WINDOW_MS);
  s.failures.push(now);
  if (rateLimited) s.failures.push(now);
  if (s.failures.length >= FAIL_THRESHOLD) {
    s.skipUntil = now + SKIP_MS;
    s.failures = [];
  }
}

/** Record a success: clears the failure window for that provider. */
export function recordSuccess(provider: string): void {
  const s = stateFor(provider);
  s.failures = [];
  s.skipUntil = 0;
}

/** Test helper: reset all breaker state. */
export function resetBreakers(): void {
  states.clear();
}
