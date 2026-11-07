import { NextResponse } from "next/server";
import { getSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ageGate } from "@/lib/age";
import { getPaddle, paddleConfigured } from "@/lib/paddle";
import { audit } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Creates a Paddle hosted-checkout transaction for the Premium plan.
// Auth + age 18+ required. No card data touches this site.
export async function GET() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
}

export async function POST(req: Request) {
  const session = await getSessionSafe().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!prisma) return NextResponse.json({ error: "Checkout is not configured yet." }, { status: 503 });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (user.status === "SUSPENDED") return NextResponse.json({ error: "Account suspended." }, { status: 403 });
  if (!user.dateOfBirth || ageGate(user.dateOfBirth) !== "FULL") {
    return NextResponse.json({ error: "Paid plans require age 18+. Please complete age confirmation on your account." }, { status: 403 });
  }
  if (!paddleConfigured()) {
    return NextResponse.json({ error: "Checkout is not configured yet." }, { status: 503 });
  }
  const paddle = getPaddle();
  // Billing period: "monthly" (default) or "yearly" when a yearly
  // price id is configured. An unknown value falls back to monthly;
  // a yearly request without a yearly price id is refused honestly.
  let billing: string = "monthly";
  try {
    const body = (await req.json().catch(() => null)) as { billing?: string } | null;
    if (body?.billing === "yearly") billing = "yearly";
  } catch {
    // Empty body (old callers): monthly.
  }
  const priceId =
    billing === "yearly" ? process.env.PADDLE_PRICE_ID_YEARLY : process.env.PADDLE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: billing === "yearly" ? "Yearly billing is not configured yet." : "Checkout is not configured yet." }, { status: 503 });
  }
  if (!paddle) return NextResponse.json({ error: "Checkout is not configured yet." }, { status: 503 });
  try {
    const tx = await paddle.transactions.create({
      items: [{ priceId, quantity: 1 }],
      // Paddle mapping key: Supabase id/email first (the stable identity);
      // Prisma userId kept as fallback for webhooks predating the rework.
      customData: { userId, supabaseId: user.supabaseId ?? undefined, supabaseEmail: user.email },
    });
    const url = (tx as unknown as { checkout?: { url?: string } }).checkout?.url;
    if (!url) return NextResponse.json({ error: "Checkout could not be started. Please try again." }, { status: 502 });
    await audit({ actorId: userId, action: "checkout.started", targetType: "transaction", targetId: tx.id });
    return NextResponse.json({ checkoutUrl: url });
  } catch {
    return NextResponse.json({ error: "Checkout could not be started. Please try again." }, { status: 502 });
  }
}
