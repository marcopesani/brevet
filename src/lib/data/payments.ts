import {
  PendingPayment,
  parsePendingPaymentId,
  serializePendingPayment,
  serializePendingPayments,
  validateCompletePendingPaymentInput,
  validateCreatePendingPaymentInput,
  validateFailPendingPaymentInput,
} from "@/lib/models/pending-payment";
import { parseObjectId } from "@/lib/models/zod";
import { connectDB } from "@/lib/db";

/**
 * Get all pending (non-expired) payments for a user.
 */
export async function getPendingPayments(userId: string, options?: { chainId?: number }) {
  await connectDB();
  const userObjectId = parseObjectId(userId, "userId");
  const filter: Record<string, unknown> = {
    userId: userObjectId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  };
  if (options?.chainId !== undefined) {
    filter.chainId = options.chainId;
  }
  const docs = await PendingPayment.find(filter)
    .sort({ createdAt: -1 })
    .lean();
  return serializePendingPayments(docs);
}

/**
 * Get the count of pending (non-expired) payments for a user.
 */
export async function getPendingCount(userId: string, options?: { chainId?: number }) {
  await connectDB();
  const userObjectId = parseObjectId(userId, "userId");
  const filter: Record<string, unknown> = {
    userId: userObjectId,
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
export async function getPendingPayment(paymentId: string, userId: string) {
  await connectDB();
  const paymentObjectId = parsePendingPaymentId(paymentId);
  const userObjectId = parseObjectId(userId, "userId");
  const doc = await PendingPayment.findOne({
    _id: paymentObjectId,
    userId: userObjectId,
  }).lean();
  return doc ? serializePendingPayment(doc) : null;
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
}) {
  await connectDB();
  const parsed = validateCreatePendingPaymentInput(data);
  const doc = await PendingPayment.create({
    userId: parseObjectId(parsed.userId, "userId"),
    url: parsed.url,
    method: parsed.method ?? "GET",
    amount: parsed.amount ?? 0,
    ...(parsed.amountRaw !== undefined && parsed.amountRaw !== "" && { amountRaw: parsed.amountRaw }),
    ...(parsed.asset !== undefined && parsed.asset !== "" && { asset: parsed.asset }),
    ...(parsed.chainId !== undefined && { chainId: parsed.chainId }),
    paymentRequirements: parsed.paymentRequirements,
    expiresAt: parsed.expiresAt,
    requestBody: parsed.body ?? null,
    requestHeaders: parsed.headers ? JSON.stringify(parsed.headers) : null,
  });
  return serializePendingPayment(doc.toObject());
}

/**
 * Get a single pending payment by ID, scoped to the given user.
 */
export async function getPendingPaymentById(paymentId: string, userId: string) {
  await connectDB();
  const paymentObjectId = parsePendingPaymentId(paymentId);
  const userObjectId = parseObjectId(userId, "userId");
  const doc = await PendingPayment.findOne({
    _id: paymentObjectId,
    userId: userObjectId,
  }).lean();
  return doc ? serializePendingPayment(doc) : null;
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
) {
  await connectDB();
  const paymentObjectId = parsePendingPaymentId(paymentId);
  const userObjectId = parseObjectId(userId, "userId");
  const parsed = validateCompletePendingPaymentInput(data);
  const doc = await PendingPayment.findOneAndUpdate(
    { _id: paymentObjectId, status: "approved", userId: userObjectId },
    {
      $set: {
        status: "completed",
        responsePayload: parsed.responsePayload,
        responseStatus: parsed.responseStatus,
        txHash: parsed.txHash ?? null,
        completedAt: new Date(),
      },
    },
    { returnDocument: "after", runValidators: true },
  ).lean();
  return doc ? serializePendingPayment(doc) : null;
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
) {
  await connectDB();
  const paymentObjectId = parsePendingPaymentId(paymentId);
  const userObjectId = parseObjectId(userId, "userId");
  const parsed = validateFailPendingPaymentInput(data);
  const doc = await PendingPayment.findOneAndUpdate(
    { _id: paymentObjectId, status: "approved", userId: userObjectId },
    {
      $set: {
        status: "failed",
        responsePayload: parsed.responsePayload ?? parsed.error ?? null,
        responseStatus: parsed.responseStatus ?? null,
        completedAt: new Date(),
      },
    },
    { returnDocument: "after", runValidators: true },
  ).lean();
  return doc ? serializePendingPayment(doc) : null;
}

/**
 * Mark a pending payment as approved and store the signature.
 * Only succeeds if the payment is currently "pending" (atomic precondition).
 * Requires userId for defense-in-depth ownership verification.
 * Returns null if the payment was already transitioned by another caller.
 */
export async function approvePendingPayment(paymentId: string, userId: string, signature: string) {
  await connectDB();
  const paymentObjectId = parsePendingPaymentId(paymentId);
  const userObjectId = parseObjectId(userId, "userId");
  const doc = await PendingPayment.findOneAndUpdate(
    { _id: paymentObjectId, status: "pending", userId: userObjectId },
    { $set: { status: "approved", signature } },
    { returnDocument: "after", runValidators: true },
  ).lean();
  return doc ? serializePendingPayment(doc) : null;
}

/**
 * Mark a pending payment as rejected.
 * Only succeeds if the payment is currently "pending" (atomic precondition).
 * Requires userId for defense-in-depth ownership verification.
 * Returns null if the payment was already transitioned by another caller.
 */
export async function rejectPendingPayment(paymentId: string, userId: string) {
  await connectDB();
  const paymentObjectId = parsePendingPaymentId(paymentId);
  const userObjectId = parseObjectId(userId, "userId");
  const doc = await PendingPayment.findOneAndUpdate(
    { _id: paymentObjectId, status: "pending", userId: userObjectId },
    { $set: { status: "rejected" } },
    { returnDocument: "after", runValidators: true },
  ).lean();
  return doc ? serializePendingPayment(doc) : null;
}

/**
 * Mark a pending payment as expired.
 * Only succeeds if the payment is currently "pending" (atomic precondition).
 * Requires userId for defense-in-depth ownership verification.
 * Returns null if the payment was already transitioned by another caller.
 */
export async function expirePendingPayment(paymentId: string, userId: string) {
  await connectDB();
  const paymentObjectId = parsePendingPaymentId(paymentId);
  const userObjectId = parseObjectId(userId, "userId");
  const doc = await PendingPayment.findOneAndUpdate(
    { _id: paymentObjectId, status: "pending", userId: userObjectId },
    { $set: { status: "expired" } },
    { returnDocument: "after", runValidators: true },
  ).lean();
  return doc ? serializePendingPayment(doc) : null;
}
