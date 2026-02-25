import {
  Transaction,
  serializeTransaction,
  validateTransactionCreateInput,
} from "@/lib/models/transaction";
import { connectDB } from "@/lib/db";
import { toObjectId } from "@/lib/models/zod-utils";

/**
 * Get recent transactions for a user, limited to a specified count.
 */
export async function getRecentTransactions(userId: string, limit: number = 5, options?: { chainId?: number }) {
  await connectDB();
  const filter: Record<string, unknown> = { userId: toObjectId(userId, "userId") };
  if (options?.chainId !== undefined) {
    filter.chainId = options.chainId;
  }
  const docs = await Transaction.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit);
  return docs.map((doc) => serializeTransaction(doc));
}

/**
 * Get transactions for a user with optional date range filtering.
 */
export async function getTransactions(
  userId: string,
  options?: { since?: Date; until?: Date; chainId?: number },
) {
  await connectDB();
  const filter: Record<string, unknown> = { userId: toObjectId(userId, "userId") };

  if (options?.since || options?.until) {
    const createdAt: Record<string, Date> = {};
    if (options.since) createdAt.$gte = options.since;
    if (options.until) createdAt.$lte = options.until;
    filter.createdAt = createdAt;
  }

  if (options?.chainId !== undefined) {
    filter.chainId = options.chainId;
  }

  const docs = await Transaction.find(filter)
    .sort({ createdAt: -1 });
  return docs.map((doc) => serializeTransaction(doc));
}

/**
 * Get spending history for MCP tools (optionally filtered by date, limited to 100).
 */
export async function getSpendingHistory(
  userId: string,
  options?: { since?: Date; chainId?: number },
) {
  await connectDB();
  const filter: Record<string, unknown> = { userId: toObjectId(userId, "userId") };
  if (options?.since) {
    filter.createdAt = { $gte: options.since };
  }
  if (options?.chainId !== undefined) {
    filter.chainId = options.chainId;
  }

  const docs = await Transaction.find(filter)
    .sort({ createdAt: -1 })
    .limit(100);
  return docs.map((doc) => serializeTransaction(doc));
}

/**
 * Create a new transaction record.
 */
export async function createTransaction(data: {
  amount: number;
  endpoint: string;
  txHash?: string | null;
  network: string;
  chainId?: number;
  status: string;
  type?: string;
  userId: string;
  responsePayload?: string | null;
  errorMessage?: string | null;
  responseStatus?: number | null;
}) {
  await connectDB();
  const validated = validateTransactionCreateInput(data);
  const doc = await Transaction.create(validated);
  return serializeTransaction(doc);
}
