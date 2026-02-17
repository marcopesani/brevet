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
}) {
  return prisma.pendingPayment.create({
    data: {
      userId: data.userId,
      url: data.url,
      method: data.method ?? "GET",
      amount: data.amount,
      paymentRequirements: data.paymentRequirements,
      expiresAt: data.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
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
