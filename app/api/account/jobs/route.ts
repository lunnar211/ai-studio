import { NextResponse } from "next/server";
import { getSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DB_MSG =
  "Logo history is not available yet: the database needs one schema update (the site owner runs one command). Your generations still work; they just are not saved.";

function parseVariants(row: { variantsJson: string }): string[] {
  try {
    const v = JSON.parse(row.variantsJson) as unknown;
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const session = await getSessionSafe();
  const userId = session?.user?.id ?? null;
  if (!userId) return NextResponse.json({ error: "Sign in to see your logo history." }, { status: 401 });
  if (!prisma) return NextResponse.json({ error: DB_MSG }, { status: 503 });
  try {
    const rows = await prisma.logoGeneration.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({
      jobs: rows.map((r) => ({
        id: r.id,
        prompt: r.prompt,
        style: r.style,
        colors: r.colors,
        brandName: r.brandName,
        favorite: r.favorite,
        createdAt: r.createdAt.toISOString(),
        variants: parseVariants(r),
      })),
    });
  } catch {
    return NextResponse.json({ error: DB_MSG }, { status: 503 });
  }
}

export async function DELETE() {
  const session = await getSessionSafe();
  const userId = session?.user?.id ?? null;
  if (!userId) return NextResponse.json({ error: "Sign in to manage your logo history." }, { status: 401 });
  if (!prisma) return NextResponse.json({ error: DB_MSG }, { status: 503 });
  try {
    await prisma.logoGeneration.deleteMany({ where: { userId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: DB_MSG }, { status: 503 });
  }
}
