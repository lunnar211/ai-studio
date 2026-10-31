import { PrismaClient } from "@prisma/client";

// Null when DATABASE_URL is unset: the site then runs in guest-only mode
// (logo generator + photo enhancer keep working) and auth/admin features
// show an honest "not configured" state. Never throws at import time, so
// `next build` succeeds with DATABASE_URL unset.
export const dbConfigured = Boolean(process.env.DATABASE_URL);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient | null = dbConfigured
  ? (globalForPrisma.prisma ?? new PrismaClient())
  : null;

if (process.env.NODE_ENV !== "production" && prisma) {
  globalForPrisma.prisma = prisma;
}
