import { NextResponse } from "next/server";
import { getPaddle } from "@/lib/paddle";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Paddle webhook: signature verified with the Paddle SDK, idempotent via
// WebhookEvent.eventId (duplicate event id -> 200 ignored). Only
// transaction.completed + subscription.* are handled; everything else is
// recorded and ignored. Never stores card data.
export async function POST(req: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  const signature = req.headers.get("paddle-signature") || "";
  if (!secret || !signature) {
    return NextResponse.json({ error: "Missing webhook signature." }, { status: 400 });
  }
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const paddle = getPaddle();
  if (!paddle) return NextResponse.json({ error: "Paddle not configured." }, { status: 503 });

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  let event: { eventId: string; eventType: string; data: Record<string, unknown> };
  try {
    event = (await paddle.webhooks.unmarshal(raw, secret, signature)) as unknown as typeof event;
  } catch {
    await logError("paddle-webhook", "Signature verification failed", "/api/webhooks/paddle");
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const eventId = event.eventId;
  const existing = await prisma.webhookEvent.findUnique({ where: { eventId } }).catch(() => null);
  if (existing) return NextResponse.json({ ok: true, ignored: true });
  try {
    await prisma.webhookEvent.create({
      data: { provider: "PADDLE", eventId, eventType: event.eventType },
    });
  } catch {
    // Lost a race with a duplicate delivery: ignore it.
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    // Paddle event payloads are loosely typed by the SDK; narrow fields
    // defensively below (String()/parseInt with fallbacks, never raw use).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = event.data as Record<string, any>;
    const customData = (data.customData || data.custom_data || {}) as Record<string, unknown>;
    if (event.eventType === "transaction.completed") {
      const userId = typeof customData.userId === "string" ? customData.userId : null;
      if (userId) {
        const totals = data.details?.totals || {};
        const amount = parseInt(String(totals.total ?? "0"), 10) || 0;
        await prisma.payment.upsert({
          where: { transactionId: String(data.id) },
          update: { status: String(data.status ?? "completed") },
          create: {
            userId,
            provider: "PADDLE",
            transactionId: String(data.id),
            invoiceId: data.invoiceId ? String(data.invoiceId) : null,
            amount,
            currency: String(data.currencyCode ?? totals.currencyCode ?? "USD"),
            status: String(data.status ?? "completed"),
          },
        });
        await prisma.user.update({ where: { id: userId }, data: { plan: "PREMIUM" } });
      }
    } else if (
      event.eventType === "subscription.created" ||
      event.eventType === "subscription.updated" ||
      event.eventType === "subscription.canceled" ||
      event.eventType === "subscription.cancelled"
    ) {
      let userId = typeof customData.userId === "string" ? customData.userId : null;
      if (!userId) {
        const bySub = await prisma.subscription.findUnique({ where: { subscriptionId: String(data.id) } });
        userId = bySub?.userId ?? null;
        if (!userId && data.customerId) {
          const byCustomer = await prisma.subscription.findFirst({ where: { customerId: String(data.customerId) } });
          userId = byCustomer?.userId ?? null;
        }
      }
      if (userId) {
        const status = String(data.status ?? "");
        const active = ["active", "trialing", "past_due"].includes(status);
        await prisma.subscription.upsert({
          where: { subscriptionId: String(data.id) },
          update: {
            status,
            plan: active ? "PREMIUM" : "FREE",
            currentPeriodEnd: data.currentBillingPeriod?.endsAt ? new Date(data.currentBillingPeriod.endsAt) : null,
          },
          create: {
            userId,
            provider: "PADDLE",
            customerId: String(data.customerId ?? ""),
            subscriptionId: String(data.id),
            plan: active ? "PREMIUM" : "FREE",
            status,
            currentPeriodEnd: data.currentBillingPeriod?.endsAt ? new Date(data.currentBillingPeriod.endsAt) : null,
          },
        });
        if (!active && (event.eventType.includes("cancel"))) {
          await prisma.user.update({ where: { id: userId }, data: { plan: "FREE" } });
        } else if (active) {
          await prisma.user.update({ where: { id: userId }, data: { plan: "PREMIUM" } });
        }
      }
    }
    await prisma.webhookEvent.update({ where: { eventId }, data: { processedAt: new Date() } });
  } catch (e) {
    await logError("paddle-webhook", `Handler failed for ${event.eventType}: ${String(e).slice(0, 200)}`, "/api/webhooks/paddle");
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
