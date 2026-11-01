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

export type PaddlePriceDisplay = {
  amountMinor: number;
  currency: string;
  interval: string;
  frequency: number;
};

/**
 * Fetch one Paddle price for display on /pricing. Returns null when
 * Paddle is unconfigured, the price id is unknown, or the API call
 * fails — the pricing page then hides Upgrade instead of inventing
 * a price. Amounts are minor units (cents); interval/frequency come
 * from the price's billing period (e.g. month/1, year/1).
 */
export async function getPaddlePriceDisplay(priceId: string): Promise<PaddlePriceDisplay | null> {
  const paddle = getPaddle();
  if (!paddle || !priceId) return null;
  try {
    const price = (await paddle.prices.get(priceId)) as unknown as {
      unitPrice?: { amount?: string | number; currencyCode?: string };
      billingPeriod?: { interval?: string; frequency?: number };
    };
    const amountRaw = price?.unitPrice?.amount;
    const amountMinor = typeof amountRaw === "string" ? parseInt(amountRaw, 10) : typeof amountRaw === "number" ? amountRaw : NaN;
    const currency = price?.unitPrice?.currencyCode;
    const interval = price?.billingPeriod?.interval;
    if (!Number.isFinite(amountMinor) || !currency || !interval) return null;
    return {
      amountMinor,
      currency,
      interval,
      frequency: price.billingPeriod?.frequency ?? 1,
    };
  } catch {
    return null;
  }
}

/** Format a Paddle price for display (e.g. "$19.00 / month"). Pure. */
export function formatPaddlePrice(p: PaddlePriceDisplay): string {
  let amount: string;
  try {
    amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: p.currency,
      minimumFractionDigits: 2,
    }).format(p.amountMinor / 100);
  } catch {
    amount = `${(p.amountMinor / 100).toFixed(2)} ${p.currency}`;
  }
  const period = p.frequency > 1 ? `every ${p.frequency} ${p.interval}s` : `per ${p.interval}`;
  return `${amount} ${period}`;
}
