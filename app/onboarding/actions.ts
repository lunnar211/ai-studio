"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ageGate, parseDob } from "@/lib/age";

// Returns a plain result; the client decides what to show. Under-13 and
// 13-15 are never saved: under-13 deletes the account entirely.
export async function completeOnboarding(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  blocked?: "UNDER_13" | "UNDER_16";
}> {
  const session = await auth().catch(() => null);
  const userId = (session?.user as unknown as { id?: string } | undefined)?.id;
  if (!userId || !prisma) return { ok: false, error: "Sign-in is not configured." };
  const dobRaw = String(formData.get("dob") || "");
  const confirm = formData.get("confirm") === "on";
  const terms = formData.get("terms") === "on";
  if (!confirm || !terms) return { ok: false, error: "Please confirm your age and accept the Terms." };
  const dob = parseDob(dobRaw);
  if (!dob) return { ok: false, error: "Please enter a valid date of birth." };
  const gate = ageGate(dob);
  if (gate === "BLOCKED_UNDER_13") {
    // No data kept: delete authored notes first (no cascade on that side),
    // then the user row (accounts, sessions, subscriptions, payments,
    // notes about them cascade; jobs are set to null user).
    try {
      await prisma.adminNote.deleteMany({ where: { authorId: userId } });
      await prisma.user.delete({ where: { id: userId } });
    } catch {
      // If deletion fails, refuse activation rather than keeping data.
    }
    return { ok: false, blocked: "UNDER_13" };
  }
  if (gate === "BLOCKED_UNDER_16") {
    return { ok: false, blocked: "UNDER_16" };
  }
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        dateOfBirth: dob,
        ageConfirmed: true,
        ageConfirmedAt: new Date(),
        termsAcceptedAt: new Date(),
      },
    });
  } catch {
    return { ok: false, error: "Could not save. Please try again." };
  }
  redirect("/account");
}
