import {
  PendingPayment,
  serializePendingPayment,
  validatePendingPaymentApproveInput,
  validatePendingPaymentCompleteInput,
  validatePendingPaymentCreateInput,
  validatePendingPaymentFailInput,
} from "@/lib/models/pending-payment";
import { connectDB } from "@/lib/db";
import { toObjectId } from "@/lib/models/zod-utils";

/**
 * Get all pending (non-expired) payments for a user.
 */
export async function getPendingPayments(userId: string, options?: { chainId?: number }) {
  await connectDB();
  const filter: Record<string, unknown> = {
    userId: toObjectId(userId, "userId"),
    status: "pending",
    expiresAt: { $gt: new Date() },
  };
  if (options?.chainId !== undefined) {
    filter.chainId = options.chainId;
  }
  const docs = await PendingPayment.find(filter)
    .sort({ createdAt: -1 });
  return docs.map((doc) => serializePendingPayment(doc));
}

/**
 * Get the count of pending (non-expired) payments for a user.
 */
export async function getPendingCount(userId: string, options?: { chainId?: number }) {
  await connectDB();
  const filter: Record<string, unknown> = {
    userId: toObjectId(userId, "userId"),
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
  const doc = await PendingPayment.findOne({
    _id: toObjectId(paymentId, "paymentId"),
    userId: toObjectId(userId, "userId"),
  });
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
  const validated = validatePendingPaymentCreateInput(data);
  const doc = await PendingPayment.create(validated);
  return serializePendingPayment(doc);
}

/**
 * Get a single pending payment by ID, scoped to the given user.
 */
export async function getPendingPaymentById(paymentId: string, userId: string) {
  await connectDB();
  const doc = await PendingPayment.findOne({
    _id: toObjectId(paymentId, "paymentId"),
    userId: toObjectId(userId, "userId"),
  });
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
  const validated = validatePendingPaymentCompleteInput(data);
  const doc = await PendingPayment.findOneAndUpdate(
    {
      _id: toObjectId(paymentId, "paymentId"),
      status: "approved",
      userId: toObjectId(userId, "userId"),
    },
    {
      $set: {
        status: "completed",
        responsePayload: validated.responsePayload,
        responseStatus: validated.responseStatus,
        txHash: validated.txHash ?? null,
        completedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
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
  const validated = validatePendingPaymentFailInput(data);
  const doc = await PendingPayment.findOneAndUpdate(
    {
      _id: toObjectId(paymentId, "paymentId"),
      status: "approved",
      userId: toObjectId(userId, "userId"),
    },
    {
      $set: {
        status: "failed",
        responsePayload: validated.responsePayload ?? validated.error ?? null,
        responseStatus: validated.responseStatus ?? null,
        completedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
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
  const validated = validatePendingPaymentApproveInput({ signature });
  const doc = await PendingPayment.findOneAndUpdate(
    {
      _id: toObjectId(paymentId, "paymentId"),
      status: "pending",
      userId: toObjectId(userId, "userId"),
    },
    { $set: { status: "approved", signature: validated.signature } },
    { returnDocument: "after" },
  );
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
  const doc = await PendingPayment.findOneAndUpdate(
    {
      _id: toObjectId(paymentId, "paymentId"),
      status: "pending",
      userId: toObjectId(userId, "userId"),
    },
    { $set: { status: "rejected" } },
    { returnDocument: "after" },
  );
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
  const doc = await PendingPayment.findOneAndUpdate(
    {
      _id: toObjectId(paymentId, "paymentId"),
      status: "pending",
      userId: toObjectId(userId, "userId"),
    },
    { $set: { status: "expired" } },
    { returnDocument: "after" },
  );
  return doc ? serializePendingPayment(doc) : null;
}
