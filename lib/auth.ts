import { createSupabaseServerClient, supabaseConfigured } from "./supabase/server";
import { prisma } from "./prisma";
import type { User } from "@prisma/client";

// Supabase Auth (Google provider) on the owner's existing Supabase project.
// No Auth.js, no Google Cloud OAuth client of our own, no JWT session code
// of our own: Supabase issues and refreshes the session cookies, and this
// module maps the Supabase user to its Prisma User row.
//
// Guest mode is preserved: when Supabase env vars or DATABASE_URL are
// unset, getSessionSafe() returns null and tools keep working as guests.
// Suspended users DO get a session object (so tool routes can answer 403
// "Account suspended" as before); account/admin guards reject them.

export { supabaseConfigured };

export const adminEmails = (): string[] =>
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

// Sign-in button gate: Supabase env present. (Database presence is NOT
// required to show the button: the callback handles a missing DB honestly
// instead of looping the user between /account and /signin.)
export const authConfigured = supabaseConfigured;

export type AppUser = {
  id: string; // Prisma User id — the id every route/guard uses
  supabaseId: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  role: string;
  adminRole: string | null;
  plan: string;
  status: string;
  ageConfirmed: boolean;
};

export type AppSession = { user: AppUser };

export type SupabaseIdentity = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

// First-login upsert: by supabaseId, then by email (adopts a row created
// before supabaseId existed), else creates the row. Bootstrap: the first
// allowlisted login becomes ADMIN + SUPER. lastLoginAt is throttled to
// one write per hour so ordinary page views don't write on every request.
// Returns null when there is no database (caller handles that honestly).
export async function ensurePrismaUser(identity: SupabaseIdentity): Promise<User | null> {
  if (!prisma || !identity.email) return null;
  const email = identity.email;
  let dbUser = await prisma.user.findUnique({ where: { supabaseId: identity.id } }).catch(() => null);
  if (!dbUser) {
    const byEmail = await prisma.user.findUnique({ where: { email } }).catch(() => null);
    if (byEmail) {
      dbUser = await prisma.user
        .update({ where: { id: byEmail.id }, data: { supabaseId: identity.id } })
        .catch(() => byEmail);
    }
  }
  if (!dbUser) {
    dbUser = await prisma.user
      .create({
        data: {
          supabaseId: identity.id,
          email,
          name: identity.name ?? null,
          image: identity.image ?? null,
        },
      })
      .catch(() => null);
    if (!dbUser) return null;
  }
  const updates: Record<string, unknown> = {};
  if (dbUser.role !== "ADMIN" && adminEmails().includes(email.toLowerCase())) {
    updates.role = "ADMIN";
    updates.adminRole = "SUPER";
  }
  const last = dbUser.lastLoginAt?.getTime() ?? 0;
  if (Date.now() - last > 60 * 60 * 1000) updates.lastLoginAt = new Date();
  if (Object.keys(updates).length > 0) {
    dbUser = await prisma.user.update({ where: { id: dbUser.id }, data: updates as never }).catch(() => dbUser);
  }
  return dbUser;
}

function toAppSession(dbUser: User, supabaseId: string): AppSession {
  return {
    user: {
      id: dbUser.id,
      supabaseId,
      email: dbUser.email,
      name: dbUser.name,
      image: dbUser.image,
      role: dbUser.role,
      adminRole: dbUser.adminRole,
      plan: dbUser.plan,
      status: dbUser.status,
      ageConfirmed: dbUser.ageConfirmed,
    },
  };
}

// Safe session read: returns null when Supabase/DB is not configured, the
// visitor has no Supabase session, or the Prisma row is missing — instead
// of throwing into a page render. Callers that need the raw Supabase user
// (e.g. the callback route) use createSupabaseServerClient() directly.
export async function getSessionSafe(): Promise<AppSession | null> {
  if (!supabaseConfigured || !prisma) return null;
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return null;
    const dbUser = await ensurePrismaUser({
      id: user.id,
      email: user.email,
      name: (user.user_metadata?.full_name as string | undefined) ?? user.user_metadata?.name ?? null,
      image: (user.user_metadata?.avatar_url as string | undefined) ?? user.user_metadata?.picture ?? null,
    });
    if (!dbUser) return null;
    return toAppSession(dbUser, user.id);
  } catch {
    return null;
  }
}
