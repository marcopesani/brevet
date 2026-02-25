import { Transaction, serializeTransaction } from "@/lib/models/transaction";
import { connectDB } from "@/lib/db";
import { toObjectId } from "@/lib/models/zod-utils";

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

export interface AnalyticsData {
  dailySpending: DailySpending[];
  summary: AnalyticsSummary;
}

/**
 * Get aggregated spending analytics for a user (last 30 days).
 */
export async function getAnalytics(userId: string, options?: { chainId?: number }): Promise<AnalyticsData> {
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
    userId: toObjectId(userId, "userId"),
    type: "payment",
    createdAt: { $gte: thirtyDaysAgo },
  };
  if (options?.chainId !== undefined) {
    txFilter.chainId = options.chainId;
  }

  const transactions = await Transaction.find(txFilter)
    .sort({ createdAt: 1 });
  const serializedTransactions = transactions.map((tx) => serializeTransaction(tx));

  const dailyMap = new Map<string, number>();

  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    const key = d.toISOString().split("T")[0];
    dailyMap.set(key, 0);
  }

  let today = 0;
  let thisWeek = 0;
  let thisMonth = 0;
  let totalAmount = 0;

  for (const tx of serializedTransactions) {
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
  }

  const dailySpending = Array.from(dailyMap.entries()).map(([date, amount]) => ({
    date,
    amount: Math.round(amount * 100) / 100,
  }));

  const summary: AnalyticsSummary = {
    today: Math.round(today * 100) / 100,
    thisWeek: Math.round(thisWeek * 100) / 100,
    thisMonth: Math.round(thisMonth * 100) / 100,
    totalTransactions: serializedTransactions.length,
    avgPaymentSize:
      serializedTransactions.length > 0
        ? Math.round((totalAmount / serializedTransactions.length) * 100) / 100
        : 0,
  };

  return { dailySpending, summary };
}
