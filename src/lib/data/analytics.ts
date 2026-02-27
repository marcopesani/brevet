import { Transaction } from "@/lib/models/transaction";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { cache } from "react";

export interface AnalyticsSummary {
  today: number;
  thisWeek: number;
  thisMonth: number;
  totalTransactions: number;
  avgPaymentSize: number;
}

export interface DailySpending {
  date: string;
  amount: number;
}

export interface DailyMetrics {
  date: string;
  count: number;
  spending: number;
  successRate: number;
}

export interface MetricsSummary {
  totalCount: number;
  totalSpending: number;
  overallSuccessRate: number;
}

export interface AnalyticsData {
  dailySpending: DailySpending[];
  summary: AnalyticsSummary;
  dailyMetrics: DailyMetrics[];
  metricsSummary: MetricsSummary;
}

function isSuccessStatus(status: string): boolean {
  return status === "completed" || status === "confirmed";
}

function isFailureStatus(status: string): boolean {
  return status === "failed";
}

/**
 * Get aggregated spending analytics for a user (last 30 days).
 * Wrapped with React cache() to deduplicate within a single server request.
 * Uses primitive arguments for proper cache hit detection (Object.is() comparison).
 */
export const getAnalytics = cache(async function getAnalytics(
  userId: string,
  chainId?: number
): Promise<AnalyticsData> {
  await connectDB();
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(now);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const txFilter: Record<string, unknown> = {
    userId: new Types.ObjectId(userId),
    type: "payment",
    createdAt: { $gte: thirtyDaysAgo },
  };
  if (chainId !== undefined) {
    txFilter.chainId = chainId;
  }

  const transactions = await Transaction.find(txFilter)
    .sort({ createdAt: 1 })
    .lean();

  const dailyMap = new Map<string, number>();
  const dailyMetricsMap = new Map<string, { count: number; spending: number; success: number; failure: number }>();

  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    const key = d.toISOString().split("T")[0];
    dailyMap.set(key, 0);
    dailyMetricsMap.set(key, { count: 0, spending: 0, success: 0, failure: 0 });
  }

  let today = 0;
  let thisWeek = 0;
  let thisMonth = 0;
  let totalAmount = 0;
  let totalSuccess = 0;
  let totalFailure = 0;

  for (const tx of transactions) {
    const dateKey = tx.createdAt.toISOString().split("T")[0];
    dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + tx.amount);

    totalAmount += tx.amount;

    if (tx.createdAt >= startOfToday) {
      today += tx.amount;
    }
    if (tx.createdAt >= startOfWeek) {
      thisWeek += tx.amount;
    }
    if (tx.createdAt >= startOfMonth) {
      thisMonth += tx.amount;
    }

    // Daily metrics aggregation
    const dayMetrics = dailyMetricsMap.get(dateKey);
    if (dayMetrics) {
      dayMetrics.count += 1;
      dayMetrics.spending += tx.amount;
      if (isSuccessStatus(tx.status)) {
        dayMetrics.success += 1;
        totalSuccess += 1;
      } else if (isFailureStatus(tx.status)) {
        dayMetrics.failure += 1;
        totalFailure += 1;
      }
    }
  }

  const dailySpending = Array.from(dailyMap.entries()).map(([date, amount]) => ({
    date,
    amount: Math.round(amount * 100) / 100,
  }));

  const dailyMetrics: DailyMetrics[] = Array.from(dailyMetricsMap.entries()).map(([date, metrics]) => {
    const resolved = metrics.success + metrics.failure;
    const successRate = resolved > 0 ? Math.round((metrics.success / resolved) * 1000) / 10 : 0;
    return {
      date,
      count: metrics.count,
      spending: Math.round(metrics.spending * 100) / 100,
      successRate,
    };
  });

  const summary: AnalyticsSummary = {
    today: Math.round(today * 100) / 100,
    thisWeek: Math.round(thisWeek * 100) / 100,
    thisMonth: Math.round(thisMonth * 100) / 100,
    totalTransactions: transactions.length,
    avgPaymentSize:
      transactions.length > 0
        ? Math.round((totalAmount / transactions.length) * 100) / 100
        : 0,
  };

  const totalResolved = totalSuccess + totalFailure;
  const metricsSummary: MetricsSummary = {
    totalCount: transactions.length,
    totalSpending: Math.round(totalAmount * 100) / 100,
    overallSuccessRate: totalResolved > 0 ? Math.round((totalSuccess / totalResolved) * 1000) / 10 : 0,
  };

  return { dailySpending, summary, dailyMetrics, metricsSummary };
});
