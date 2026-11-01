import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DB_MSG =
  "Logo history is not available yet: the database needs one schema update (the site owner runs one command).";

const Patch = z.object({ favorite: z.boolean() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionSafe();
  const userId = session?.user?.id ?? null;
  if (!userId) return NextResponse.json({ error: "Sign in to manage your logo history." }, { status: 401 });
  if (!prisma) return NextResponse.json({ error: DB_MSG }, { status: 503 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const row = await prisma.logoGeneration.updateMany({
      where: { id, userId },
      data: { favorite: parsed.data.favorite },
    });
    if (row.count === 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: DB_MSG }, { status: 503 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionSafe();
  const userId = session?.user?.id ?? null;
  if (!userId) return NextResponse.json({ error: "Sign in to manage your logo history." }, { status: 401 });
  if (!prisma) return NextResponse.json({ error: DB_MSG }, { status: 503 });
  try {
    const row = await prisma.logoGeneration.deleteMany({ where: { id, userId } });
    if (row.count === 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: DB_MSG }, { status: 503 });
  }
}
