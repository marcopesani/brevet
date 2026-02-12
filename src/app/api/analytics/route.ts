import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * GET /api/analytics?userId=...
 * Returns aggregated spending data for a user.
 */
export async function GET(request: NextRequest) {
  const limited = rateLimit(getClientIp(request), 30);
  if (limited) return limited;

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

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

  // Fetch all payment transactions in the last 30 days
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      type: "payment",
      createdAt: { gte: thirtyDaysAgo },
    },
    orderBy: { createdAt: "asc" },
  });

  // Build daily spending map
  const dailyMap = new Map<string, number>();

  // Initialize all 30 days with 0
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
  }

  const dailySpending = Array.from(dailyMap.entries()).map(([date, amount]) => ({
    date,
    amount: Math.round(amount * 100) / 100,
  }));

  const summary = {
    today: Math.round(today * 100) / 100,
    thisWeek: Math.round(thisWeek * 100) / 100,
    thisMonth: Math.round(thisMonth * 100) / 100,
    totalTransactions: transactions.length,
    avgPaymentSize:
      transactions.length > 0
        ? Math.round((totalAmount / transactions.length) * 100) / 100
        : 0,
  };

  return NextResponse.json({ dailySpending, summary });
}
