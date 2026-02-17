import { prisma } from "@/lib/db";

/**
 * Get recent transactions for a user, limited to a specified count.
 */
export async function getRecentTransactions(userId: string, limit: number = 5) {
  return prisma.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Get transactions for a user with optional date range filtering.
 */
export async function getTransactions(
  userId: string,
  options?: { since?: Date; until?: Date },
) {
  const where: Record<string, unknown> = { userId };

  if (options?.since || options?.until) {
    const createdAt: Record<string, Date> = {};
    if (options.since) createdAt.gte = options.since;
    if (options.until) createdAt.lte = options.until;
    where.createdAt = createdAt;
  }

  return prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get spending history for MCP tools (optionally filtered by date, limited to 100).
 */
export async function getSpendingHistory(
  userId: string,
  options?: { since?: Date },
) {
  const where: { userId: string; createdAt?: { gte: Date } } = { userId };
  if (options?.since) {
    where.createdAt = { gte: options.since };
  }

  return prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/**
 * Create a new transaction record.
 */
export async function createTransaction(data: {
  amount: number;
  endpoint: string;
  txHash?: string | null;
  network: string;
  status: string;
  type?: string;
  userId: string;
  responsePayload?: string | null;
}) {
  return prisma.transaction.create({
    data: {
      amount: data.amount,
      endpoint: data.endpoint,
      txHash: data.txHash,
      network: data.network,
      status: data.status,
      type: data.type ?? "payment",
      userId: data.userId,
      responsePayload: data.responsePayload,
    },
  });
}
