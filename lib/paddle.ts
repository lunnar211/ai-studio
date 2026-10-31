import { Paddle, Environment } from "@paddle/paddle-node-sdk";

// Paddle Billing (merchant of record). Sandbox first; production only when
// PADDLE_ENV=production. Never store card data: only customer id, plan,
// status and invoice/transaction ids reach the database (see webhook route).
export function paddleConfigured(): boolean {
  return Boolean(process.env.PADDLE_API_KEY && process.env.PADDLE_PRICE_ID);
}

// Pure helpers (unit-tested in tests/paddle.test.ts).
export function classifyPaddleEvent(eventType: string): "transaction" | "subscription" | "ignored" {
  if (eventType === "transaction.completed") return "transaction";
  if (
    eventType === "subscription.created" ||
    eventType === "subscription.updated" ||
    eventType === "subscription.canceled" ||
    eventType === "subscription.cancelled"
  ) {
    return "subscription";
  }
  return "ignored";
}

export function paddlePlanForStatus(status: string): "PREMIUM" | "FREE" {
  return ["active", "trialing", "past_due"].includes(status) ? "PREMIUM" : "FREE";
}

export function getPaddle(): Paddle | null {
  const key = process.env.PADDLE_API_KEY;
  if (!key) return null;
  return new Paddle(key, {
    environment: process.env.PADDLE_ENV === "production" ? Environment.production : Environment.sandbox,
  });
}
