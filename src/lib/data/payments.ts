import {
  PendingPayment,
  PendingPaymentDTO,
  type PendingPaymentCreateInput,
  type PendingPaymentCompleteInput,
  type PendingPaymentFailInput,
} from "@/lib/models/pending-payment";
import { createTransaction } from "@/lib/data/transactions";
import { getChainById, getDefaultChainConfig } from "@/lib/chain-config";
import { formatAmountForDisplay } from "@/lib/x402/display";
import { logger } from "@/lib/logger";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";

/**
 * Get all pending (non-expired) payments for a user.
 * When `includeExpired` is true, also returns recently expired payments
 * so the dashboard can show retry/auto-sign actions on them.
 */
export async function getPendingPayments(userId: string, options?: { chainId?: number; includeExpired?: boolean }): Promise<PendingPaymentDTO[]> {
  await connectDB();
  const userFilter = { userId: new Types.ObjectId(userId) };
  let statusFilter: Record<string, unknown>;
  if (options?.includeExpired) {
    statusFilter = { status: { $in: ["pending", "expired"] } };
  } else {
    statusFilter = { status: "pending", expiresAt: { $gt: new Date() } };
  }
  const filter: Record<string, unknown> = { ...userFilter, ...statusFilter };
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
export async function createPendingPayment(data: PendingPaymentCreateInput): Promise<PendingPaymentDTO> {
  await connectDB();
  const doc = await PendingPayment.create({
    userId: new Types.ObjectId(data.userId),
    url: data.url,
    method: data.method ?? "GET",
    amount: data.amount ?? 0,
    ...(data.amountRaw !== undefined && data.amountRaw !== "" && { amountRaw: data.amountRaw }),
    ...(data.asset !== undefined && data.asset !== "" && { asset: data.asset }),
    chainId: data.chainId,
    paymentRequirements: data.paymentRequirements,
    expiresAt: data.expiresAt,
    requestBody: data.body ?? null,
    requestHeaders: data.headers ? JSON.stringify(data.headers) : null,
  });
  return PendingPaymentDTO.parse(doc.toObject());
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
  data: PendingPaymentCompleteInput,
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
  data: PendingPaymentFailInput,
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
 * Mark a pending payment as rejected (dismissed).
 * Succeeds if the payment is "pending" or "expired" (atomic precondition).
 * Allows users to dismiss expired payments from the dashboard.
 * Requires userId for defense-in-depth ownership verification.
 * Returns null if the payment was already transitioned by another caller.
 */
export async function rejectPendingPayment(paymentId: string, userId: string): Promise<PendingPaymentDTO | null> {
  await connectDB();
  const doc = await PendingPayment.findOneAndUpdate(
    { _id: paymentId, status: { $in: ["pending", "expired"] }, userId: new Types.ObjectId(userId) },
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

/**
 * Atomically expire a pending payment and record an "expired" transaction.
 * Returns the expired payment DTO, or null if the payment was already
 * transitioned by another caller (race-safe: no duplicate transactions).
 */
export async function expirePaymentWithAudit(
  paymentId: string,
  userId: string,
  errorMessage = "Payment expired before user approval",
): Promise<PendingPaymentDTO | null> {
  const expired = await expirePendingPayment(paymentId, userId);
  if (!expired) return null;

  const chainIdForTx = expired.chainId ?? getDefaultChainConfig().chain.id;
  const { displayAmount } = formatAmountForDisplay(expired.amountRaw, expired.asset, chainIdForTx);
  const amount = parseFloat(displayAmount);
  if (isNaN(amount)) {
    logger.warn("Could not determine amount for expired payment transaction", {
      paymentId,
      userId,
      amountRaw: expired.amountRaw,
      asset: expired.asset,
      action: "expire_amount_unknown",
    });
  }
  const chainConfig = getChainById(chainIdForTx);

  await createTransaction({
    amount: isNaN(amount) ? 0 : amount,
    endpoint: expired.url,
    network: chainConfig?.networkString ?? "base",
    chainId: chainIdForTx,
    status: "expired",
    userId: expired.userId,
    errorMessage,
  });

  return expired;
}

/**
 * Get the chainId of the most recent actionable (pending or expired) payment.
 * Used by auth-aware-providers to auto-switch to the chain with pending work.
 * Returns null if no actionable payments exist.
 */
export async function getPendingPaymentChainId(userId: string): Promise<number | null> {
  await connectDB();
  const doc = await PendingPayment.findOne(
    { userId: new Types.ObjectId(userId), status: { $in: ["pending", "expired"] } },
    { chainId: 1 },
  )
    .sort({ createdAt: -1 })
    .lean();
  return doc?.chainId ?? null;
}
