import { describe, expect, it } from "vitest";
import { POST } from "../app/api/webhooks/paddle/route";

// Paddle webhook: signature verified with the Paddle SDK before any
// processing. These paths fail before any DB write, so they run with
// DATABASE_URL unset (prisma null, logError no-ops).
describe("Paddle webhook signature gate", () => {
  it("missing signature -> 400, no processing", async () => {
    const req = new Request("http://localhost/api/webhooks/paddle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: "transaction.completed" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/signature/i);
  });
  it("bogus signature -> 400, no processing", async () => {
    const req = new Request("http://localhost/api/webhooks/paddle", {
      method: "POST",
      headers: { "Content-Type": "application/json", "paddle-signature": "ts=1;h1=deadbeef" },
      body: JSON.stringify({ event_type: "transaction.completed" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
