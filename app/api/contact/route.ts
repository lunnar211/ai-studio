import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
});

// Stores the message in the admin support inbox when the DB is configured.
// No SMTP is configured for this site, so nothing is emailed automatically:
// an admin replies from the inbox and the reply is recorded in the DB plus
// a mailto link (see README / COMPLIANCE_CHECKLIST.md).
export async function POST(req: Request) {
  if (!prisma) {
    return NextResponse.json({ error: "Contact inbox is not configured yet." }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please fill in every field correctly." }, { status: 400 });
  try {
    await prisma.supportMessage.create({ data: parsed.data });
  } catch {
    return NextResponse.json({ error: "Could not save your message. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
