import { NextResponse } from "next/server";
import { requireAdmin, auditAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function csv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export async function GET(req: Request) {
  const type = new URL(req.url).searchParams.get("type") || "users";
  const allowed = type === "users" ? ["SUPER"] : ["SUPER", "FINANCE"];
  const { session, error } = await requireAdmin(req, allowed as ("SUPER" | "FINANCE")[]);
  if (error) return error;
  if (!prisma) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  let rows: Array<Record<string, unknown>> = [];
  if (type === "users") {
    const users = await prisma.user.findMany({ take: 1000, orderBy: { createdAt: "desc" } });
    rows = users.map((u) => ({ id: u.id, email: u.email, name: u.name ?? "", role: u.role, adminRole: u.adminRole ?? "", plan: u.plan, status: u.status, country: u.country ?? "", createdAt: u.createdAt.toISOString() }));
  } else if (type === "payments") {
    const payments = await prisma.payment.findMany({ take: 1000, orderBy: { createdAt: "desc" }, include: { user: true } });
    rows = payments.map((p) => ({ id: p.id, email: p.user.email, transactionId: p.transactionId, invoiceId: p.invoiceId ?? "", amount: p.amount, currency: p.currency, status: p.status, createdAt: p.createdAt.toISOString() }));
  } else if (type === "expenses") {
    const expenses = await prisma.expense.findMany({ take: 1000, orderBy: { date: "desc" } });
    rows = expenses.map((e) => ({ id: e.id, category: e.category, vendor: e.vendor, amount: e.amount, currency: e.currency, date: e.date.toISOString().slice(0, 10), note: e.note ?? "" }));
  } else {
    return NextResponse.json({ error: "Unknown export type." }, { status: 400 });
  }
  await auditAdmin(req, session.id, `export.${type}`, "export", String(rows.length));
  return new NextResponse(csv(rows), {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="ai-studio-${type}.csv"` },
  });
}
