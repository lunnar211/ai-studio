import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

// Auth.js v5, Google-only, JWT sessions. Minimal scopes: openid, email,
// profile (the Google provider defaults to exactly these).
// Env-only credentials: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET.
// If the DB or Google credentials are missing, auth routes are inert and
// pages treat every visitor as a guest (see getSessionSafe below).

export const adminEmails = (): string[] =>
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export const authConfigured =
  Boolean(prisma) &&
  Boolean(process.env.GOOGLE_CLIENT_ID) &&
  Boolean(process.env.GOOGLE_CLIENT_SECRET) &&
  Boolean(process.env.AUTH_SECRET);

const providers = [];
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { scope: "openid email profile" } },
    })
  );
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  adapter: prisma ? PrismaAdapter(prisma) : undefined,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers,
  callbacks: {
    async signIn({ user }) {
      // Suspended users cannot sign in.
      if (!prisma || !user.id) return true;
      try {
        const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
        if (dbUser?.status === "SUSPENDED") return false;
        // Bootstrap: first Google login with an allowlisted email becomes
        // ADMIN + SUPER. The allowlist lives in env, never in code.
        if (
          dbUser &&
          dbUser.role !== "ADMIN" &&
          user.email &&
          adminEmails().includes(user.email.toLowerCase())
        ) {
          await prisma.user.update({
            where: { id: user.id },
            data: { role: "ADMIN", adminRole: "SUPER" },
          });
        }
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
      } catch {
        // Never block sign-in on a bookkeeping failure.
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.totpVerifiedAt = null;
      }
      // Refresh role/plan/age flags from the DB on token reads; the JWT
      // itself stays the Edge-readable source (no DB round-trip in
      // middleware). totpVerifiedAt is preserved, never refreshed from DB.
      if (token.id && prisma) {
        try {
          const dbUser = await prisma.user.findUnique({ where: { id: token.id as string } });
          if (dbUser) {
            token.role = dbUser.role;
            token.adminRole = dbUser.adminRole ?? null;
            token.plan = dbUser.plan;
            token.ageConfirmed = dbUser.ageConfirmed;
            token.status = dbUser.status;
          }
        } catch {
          // Keep the existing token claims.
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as unknown as Record<string, unknown>;
        u.id = token.id as string;
        u.role = token.role ?? "USER";
        u.adminRole = token.adminRole ?? null;
        u.plan = token.plan ?? "FREE";
        u.totpVerifiedAt = token.totpVerifiedAt ?? null;
        u.ageConfirmed = token.ageConfirmed ?? false;
        u.status = token.status ?? "ACTIVE";
      }
      return session;
    },
  },
});

// Safe session read: returns null when auth is not configured or the DB is
// down, instead of throwing into a page render.
export async function getSessionSafe() {
  if (!authConfigured) return null;
  try {
    return await auth();
  } catch {
    return null;
  }
}
