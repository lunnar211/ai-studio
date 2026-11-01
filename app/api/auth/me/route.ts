import { NextResponse } from "next/server";
import { getSessionSafe } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Minimal session probe for the header: returns ONLY whether the
// visitor is signed in. No email, id, or other personal data leaves
// this endpoint, so it is safe to call from every page.
export async function GET() {
  const session = await getSessionSafe().catch(() => null);
  return NextResponse.json({ signedIn: Boolean(session?.user) });
}
