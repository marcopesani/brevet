import { PendingPayment } from "@/lib/models/pending-payment";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";

/** Map a lean Mongoose doc to an object with string `id` and `userId`. */
function withId<T extends { _id: Types.ObjectId; userId?: Types.ObjectId }>(doc: T): Omit<T, "_id" | "userId"> & { id: string; userId: string } {
  const { _id, userId, ...rest } = doc;
  return { ...rest, id: _id.toString(), userId: userId ? userId.toString() : _id.toString() };
}

/**
 * Get all pending (non-expired) payments for a user.
 */
export async function getPendingPayments(userId: string, options?: { chainId?: number }) {
  await connectDB();
  const filter: Record<string, unknown> = {
    userId: new Types.ObjectId(userId),
    status: "pending",
    expiresAt: { $gt: new Date() },
  };
  if (options?.chainId !== undefined) {
    filter.chainId = options.chainId;
  }
  const docs = await PendingPayment.find(filter)
    .sort({ createdAt: -1 })
    .lean();
  return docs.map(withId);
}

/**
 * Get the count of pending (non-expired) payments for a user.
 */
export async function getPendingCount(userId: string, options?: { chainId?: number }) {
  await connectDB();
  const filter: Record<string, unknown> = {
    userId: new Types.ObjectId(userId),
    status: "pending",
    expiresAt: { $gt: new Date() },
  };
  if (options?.chainId !== undefined) {
    filter.chainId = options.chainId;
  }
  return PendingPayment.countDocuments(filter);
}

/**
 * Find a single pending payment by ID.
 */
export async function getPendingPayment(paymentId: string) {
  await connectDB();
  const doc = await PendingPayment.findById(paymentId).lean();
  return doc ? withId(doc) : null;
}

/**
 * Create a new pending payment record.
 */
export async function createPendingPayment(data: {
  userId: string;
  url: string;
  method?: string;
  amount: number;
  chainId?: number;
  paymentRequirements: string;
  expiresAt?: Date;
  body?: string;
  headers?: Record<string, string>;
}) {
  await connectDB();
  const doc = await PendingPayment.create({
    userId: new Types.ObjectId(data.userId),
    url: data.url,
    method: data.method ?? "GET",
    amount: data.amount,
    ...(data.chainId !== undefined && { chainId: data.chainId }),
    paymentRequirements: data.paymentRequirements,
    expiresAt: data.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
    requestBody: data.body ?? null,
    requestHeaders: data.headers ? JSON.stringify(data.headers) : null,
  });
  const lean = doc.toObject();
  return withId(lean);
}

/**
 * Get a single pending payment by ID.
 */
export async function getPendingPaymentById(paymentId: string) {
  await connectDB();
  const doc = await PendingPayment.findById(paymentId).lean();
  return doc ? withId(doc) : null;
}

/**
 * Mark a pending payment as completed and store response data.
 */
export async function completePendingPayment(
  paymentId: string,
  data: {
    responsePayload: string;
    responseStatus: number;
    txHash?: string;
  },
) {
  await connectDB();
  const doc = await PendingPayment.findByIdAndUpdate(
    paymentId,
    {
      $set: {
        status: "completed",
        responsePayload: data.responsePayload,
        responseStatus: data.responseStatus,
        txHash: data.txHash ?? null,
        completedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  ).lean();
  return doc ? withId(doc) : null;
}

/**
 * Mark a pending payment as failed and store error details.
 */
export async function failPendingPayment(
  paymentId: string,
  data: {
    responsePayload?: string;
    responseStatus?: number;
    error?: string;
  },
) {
  await connectDB();
  const doc = await PendingPayment.findByIdAndUpdate(
    paymentId,
    {
      $set: {
        status: "failed",
        responsePayload: data.responsePayload ?? data.error ?? null,
        responseStatus: data.responseStatus ?? null,
        completedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  ).lean();
  return doc ? withId(doc) : null;
}

/**
 * Mark a pending payment as approved and store the signature.
 */
export async function approvePendingPayment(paymentId: string, signature: string) {
  await connectDB();
  const doc = await PendingPayment.findByIdAndUpdate(
    paymentId,
    { $set: { status: "approved", signature } },
    { returnDocument: "after" },
  ).lean();
  return doc ? withId(doc) : null;
}

/**
 * Mark a pending payment as rejected.
 */
export async function rejectPendingPayment(paymentId: string) {
  await connectDB();
  const doc = await PendingPayment.findByIdAndUpdate(
    paymentId,
    { $set: { status: "rejected" } },
    { returnDocument: "after" },
  ).lean();
  return doc ? withId(doc) : null;
}

/**
 * Mark a pending payment as expired.
 */
export async function expirePendingPayment(paymentId: string) {
  await connectDB();
  const doc = await PendingPayment.findByIdAndUpdate(
    paymentId,
    { $set: { status: "expired" } },
    { returnDocument: "after" },
  ).lean();
  return doc ? withId(doc) : null;
}
