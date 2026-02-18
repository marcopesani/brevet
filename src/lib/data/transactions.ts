import { Transaction } from "@/lib/models/transaction";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";

/** Map a lean Mongoose doc to an object with string `id` and `userId`. */
function withId<T extends { _id: Types.ObjectId; userId?: Types.ObjectId }>(doc: T): Omit<T, "_id" | "userId"> & { id: string; userId: string } {
  const { _id, userId, ...rest } = doc;
  return { ...rest, id: _id.toString(), userId: userId ? userId.toString() : _id.toString() };
}

/**
 * Get recent transactions for a user, limited to a specified count.
 */
export async function getRecentTransactions(userId: string, limit: number = 5, options?: { chainId?: number }) {
  await connectDB();
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (options?.chainId !== undefined) {
    filter.chainId = options.chainId;
  }
  const docs = await Transaction.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return docs.map(withId);
}

/**
 * Get transactions for a user with optional date range filtering.
 */
export async function getTransactions(
  userId: string,
  options?: { since?: Date; until?: Date; chainId?: number },
) {
  await connectDB();
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };

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
    .sort({ createdAt: -1 })
    .lean();
  return docs.map(withId);
}

/**
 * Get spending history for MCP tools (optionally filtered by date, limited to 100).
 */
export async function getSpendingHistory(
  userId: string,
  options?: { since?: Date; chainId?: number },
) {
  await connectDB();
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (options?.since) {
    filter.createdAt = { $gte: options.since };
  }
  if (options?.chainId !== undefined) {
    filter.chainId = options.chainId;
  }

  const docs = await Transaction.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return docs.map(withId);
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
  const doc = await Transaction.create({
    amount: data.amount,
    endpoint: data.endpoint,
    txHash: data.txHash,
    network: data.network,
    ...(data.chainId !== undefined && { chainId: data.chainId }),
    status: data.status,
    type: data.type ?? "payment",
    userId: new Types.ObjectId(data.userId),
    responsePayload: data.responsePayload,
    errorMessage: data.errorMessage,
    responseStatus: data.responseStatus,
  });
  const lean = doc.toObject();
  return withId(lean);
}
