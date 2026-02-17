import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getPoolConfig() {
  const raw = process.env.DATABASE_POOL_SIZE;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  const max = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;

  return {
    connectionString: process.env.DATABASE_URL,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}

function createPrismaClient() {
  const adapter = new PrismaPg(getPoolConfig());
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
