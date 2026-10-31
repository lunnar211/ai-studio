import { NextResponse } from "next/server";
import { z } from "zod";
import { sanitizeSvg } from "@/lib/svg-sanitize";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({ svg: z.string().min(10).max(200000) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid SVG." }, { status: 400 });
  }
  const svg = sanitizeSvg(parsed.data.svg);
  if (!svg) {
    return NextResponse.json({ error: "Invalid SVG." }, { status: 400 });
  }
  try {
    const png = await sharp(Buffer.from(svg, "utf-8"))
      .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'attachment; filename="logo.png"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not convert the logo to PNG." }, { status: 400 });
  }
}
