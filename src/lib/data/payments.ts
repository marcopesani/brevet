import { prisma } from "@/lib/db";

/**
 * Get all pending (non-expired) payments for a user.
 */
export async function getPendingPayments(userId: string) {
  return prisma.pendingPayment.findMany({
    where: {
      userId,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get the count of pending (non-expired) payments for a user.
 */
export async function getPendingCount(userId: string) {
  return prisma.pendingPayment.count({
    where: {
      userId,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
  });
}

/**
 * Find a single pending payment by ID.
 */
export async function getPendingPayment(paymentId: string) {
  return prisma.pendingPayment.findUnique({
    where: { id: paymentId },
  });
}

/**
 * Create a new pending payment record.
 */
export async function createPendingPayment(data: {
  userId: string;
  url: string;
  method?: string;
  amount: number;
  paymentRequirements: string;
  expiresAt?: Date;
  body?: string;
  headers?: Record<string, string>;
}) {
  return prisma.pendingPayment.create({
    data: {
      userId: data.userId,
      url: data.url,
      method: data.method ?? "GET",
      amount: data.amount,
      paymentRequirements: data.paymentRequirements,
      expiresAt: data.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
      requestBody: data.body ?? null,
      requestHeaders: data.headers ? JSON.stringify(data.headers) : null,
    },
  });
}

/**
 * Get a single pending payment by ID.
 */
export async function getPendingPaymentById(paymentId: string) {
  return prisma.pendingPayment.findUnique({
    where: { id: paymentId },
  });
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
  return prisma.pendingPayment.update({
    where: { id: paymentId },
    data: {
      status: "completed",
      responsePayload: data.responsePayload,
      responseStatus: data.responseStatus,
      txHash: data.txHash ?? null,
      completedAt: new Date(),
    },
  });
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
  return prisma.pendingPayment.update({
    where: { id: paymentId },
    data: {
      status: "failed",
      responsePayload: data.responsePayload ?? data.error ?? null,
      responseStatus: data.responseStatus ?? null,
      completedAt: new Date(),
    },
  });
}

/**
 * Mark a pending payment as approved and store the signature.
 */
export async function approvePendingPayment(paymentId: string, signature: string) {
  return prisma.pendingPayment.update({
    where: { id: paymentId },
    data: { status: "approved", signature },
  });
}

/**
 * Mark a pending payment as rejected.
 */
export async function rejectPendingPayment(paymentId: string) {
  return prisma.pendingPayment.update({
    where: { id: paymentId },
    data: { status: "rejected" },
  });
}

/**
 * Mark a pending payment as expired.
 */
export async function expirePendingPayment(paymentId: string) {
  return prisma.pendingPayment.update({
    where: { id: paymentId },
    data: { status: "expired" },
  });
}
