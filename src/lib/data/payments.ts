import { PendingPayment, PendingPaymentDTO } from "@/lib/models/pending-payment";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";

/**
 * Get all pending (non-expired) payments for a user.
 */
export async function getPendingPayments(userId: string, options?: { chainId?: number }): Promise<PendingPaymentDTO[]> {
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
  return docs.map((doc) => PendingPaymentDTO.parse(doc));
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
 * Find a single pending payment by ID, scoped to the given user.
 */
export async function getPendingPayment(paymentId: string, userId: string): Promise<PendingPaymentDTO | null> {
  await connectDB();
  const doc = await PendingPayment.findOne({
    _id: paymentId,
    userId: new Types.ObjectId(userId),
  }).lean();
  return doc ? PendingPaymentDTO.parse(doc) : null;
}

/**
 * Create a new pending payment record.
 * Store raw amount and asset from the 402 requirement; amount (number) is optional for legacy.
 */
export async function createPendingPayment(data: {
  userId: string;
  url: string;
  method?: string;
  amount?: number;
  amountRaw?: string;
  asset?: string;
  chainId?: number;
  paymentRequirements: string;
  expiresAt: Date;
  body?: string;
  headers?: Record<string, string>;
}): Promise<PendingPaymentDTO> {
  await connectDB();
  const doc = await PendingPayment.create({
    userId: new Types.ObjectId(data.userId),
    url: data.url,
    method: data.method ?? "GET",
    amount: data.amount ?? 0,
    ...(data.amountRaw !== undefined && data.amountRaw !== "" && { amountRaw: data.amountRaw }),
    ...(data.asset !== undefined && data.asset !== "" && { asset: data.asset }),
    ...(data.chainId !== undefined && { chainId: data.chainId }),
    paymentRequirements: data.paymentRequirements,
    expiresAt: data.expiresAt,
    requestBody: data.body ?? null,
    requestHeaders: data.headers ? JSON.stringify(data.headers) : null,
  });
  return PendingPaymentDTO.parse(doc.toObject());
}

/**
 * Get a single pending payment by ID, scoped to the given user.
 */
export async function getPendingPaymentById(paymentId: string, userId: string): Promise<PendingPaymentDTO | null> {
  await connectDB();
  const doc = await PendingPayment.findOne({
    _id: paymentId,
    userId: new Types.ObjectId(userId),
  }).lean();
  return doc ? PendingPaymentDTO.parse(doc) : null;
}

/**
 * Mark a pending payment as completed and store response data.
 * Only succeeds if the payment is currently "approved" (atomic precondition).
 * Requires userId for defense-in-depth ownership verification.
 * Returns null if the payment was already transitioned by another caller.
 */
export async function completePendingPayment(
  paymentId: string,
  userId: string,
  data: {
    responsePayload: string;
    responseStatus: number;
    txHash?: string;
  },
): Promise<PendingPaymentDTO | null> {
  await connectDB();
  const doc = await PendingPayment.findOneAndUpdate(
    { _id: paymentId, status: "approved", userId: new Types.ObjectId(userId) },
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
  return doc ? PendingPaymentDTO.parse(doc) : null;
}

/**
 * Mark a pending payment as failed and store error details.
 * Only succeeds if the payment is currently "approved" (atomic precondition).
 * Requires userId for defense-in-depth ownership verification.
 * Returns null if the payment was already transitioned by another caller.
 */
export async function failPendingPayment(
  paymentId: string,
  userId: string,
  data: {
    responsePayload?: string;
    responseStatus?: number;
    error?: string;
  },
): Promise<PendingPaymentDTO | null> {
  await connectDB();
  const doc = await PendingPayment.findOneAndUpdate(
    { _id: paymentId, status: "approved", userId: new Types.ObjectId(userId) },
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
  return doc ? PendingPaymentDTO.parse(doc) : null;
}

/**
 * Mark a pending payment as approved and store the signature.
 * Only succeeds if the payment is currently "pending" (atomic precondition).
 * Requires userId for defense-in-depth ownership verification.
 * Returns null if the payment was already transitioned by another caller.
 */
export async function approvePendingPayment(paymentId: string, userId: string, signature: string): Promise<PendingPaymentDTO | null> {
  await connectDB();
  const doc = await PendingPayment.findOneAndUpdate(
    { _id: paymentId, status: "pending", userId: new Types.ObjectId(userId) },
    { $set: { status: "approved", signature } },
    { returnDocument: "after" },
  ).lean();
  return doc ? PendingPaymentDTO.parse(doc) : null;
}

/**
 * Mark a pending payment as rejected.
 * Only succeeds if the payment is currently "pending" (atomic precondition).
 * Requires userId for defense-in-depth ownership verification.
 * Returns null if the payment was already transitioned by another caller.
 */
export async function rejectPendingPayment(paymentId: string, userId: string): Promise<PendingPaymentDTO | null> {
  await connectDB();
  const doc = await PendingPayment.findOneAndUpdate(
    { _id: paymentId, status: "pending", userId: new Types.ObjectId(userId) },
    { $set: { status: "rejected" } },
    { returnDocument: "after" },
  ).lean();
  return doc ? PendingPaymentDTO.parse(doc) : null;
}

/**
 * Mark a pending payment as expired.
 * Only succeeds if the payment is currently "pending" (atomic precondition).
 * Requires userId for defense-in-depth ownership verification.
 * Returns null if the payment was already transitioned by another caller.
 */
export async function expirePendingPayment(paymentId: string, userId: string): Promise<PendingPaymentDTO | null> {
  await connectDB();
  const doc = await PendingPayment.findOneAndUpdate(
    { _id: paymentId, status: "pending", userId: new Types.ObjectId(userId) },
    { $set: { status: "expired" } },
    { returnDocument: "after" },
  ).lean();
  return doc ? PendingPaymentDTO.parse(doc) : null;
}
