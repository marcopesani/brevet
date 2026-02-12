import { prisma } from "@/lib/db";

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check whether a payment of `amount` to `endpoint` is allowed
 * under the user's spending policy.
 */
export async function checkPolicy(
  amount: number,
  endpoint: string,
  userId: string,
): Promise<PolicyCheckResult> {
  const policy = await prisma.spendingPolicy.findUnique({
    where: { userId },
  });

  if (!policy) {
    return { allowed: false, reason: "No spending policy found for user" };
  }

  // --- Per-request limit ---
  if (amount > policy.perRequestLimit) {
    return {
      allowed: false,
      reason: `Amount $${amount.toFixed(2)} exceeds per-request limit of $${policy.perRequestLimit.toFixed(2)}`,
    };
  }

  // --- Endpoint whitelist / blacklist ---
  const whitelist: string[] = JSON.parse(policy.whitelistedEndpoints);
  const blacklist: string[] = JSON.parse(policy.blacklistedEndpoints);

  if (blacklist.length > 0 && blacklist.some((b) => endpoint.startsWith(b))) {
    return {
      allowed: false,
      reason: `Endpoint "${endpoint}" is blacklisted`,
    };
  }

  if (whitelist.length > 0 && !whitelist.some((w) => endpoint.startsWith(w))) {
    return {
      allowed: false,
      reason: `Endpoint "${endpoint}" is not in the whitelist`,
    };
  }

  // --- Rolling window checks ---
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const recentTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      status: { not: "failed" },
      createdAt: { gte: oneDayAgo },
    },
    select: { amount: true, createdAt: true },
  });

  const hourlySpend = recentTransactions
    .filter((tx) => tx.createdAt >= oneHourAgo)
    .reduce((sum, tx) => sum + tx.amount, 0);

  if (hourlySpend + amount > policy.perHourLimit) {
    return {
      allowed: false,
      reason: `Hourly spend ($${(hourlySpend + amount).toFixed(2)}) would exceed limit of $${policy.perHourLimit.toFixed(2)}`,
    };
  }

  const dailySpend = recentTransactions.reduce(
    (sum, tx) => sum + tx.amount,
    0,
  );

  if (dailySpend + amount > policy.perDayLimit) {
    return {
      allowed: false,
      reason: `Daily spend ($${(dailySpend + amount).toFixed(2)}) would exceed limit of $${policy.perDayLimit.toFixed(2)}`,
    };
  }

  return { allowed: true };
}
