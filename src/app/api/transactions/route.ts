import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/transactions?userId=...&since=...&until=...
 * Fetch transaction history for a user with optional date range filtering.
 */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const since = request.nextUrl.searchParams.get("since");
  const until = request.nextUrl.searchParams.get("until");

  const where: Record<string, unknown> = { userId };

  if (since || until) {
    const createdAt: Record<string, Date> = {};
    if (since) {
      const sinceDate = new Date(since);
      if (isNaN(sinceDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid 'since' date format" },
          { status: 400 },
        );
      }
      createdAt.gte = sinceDate;
    }
    if (until) {
      const untilDate = new Date(until);
      if (isNaN(untilDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid 'until' date format" },
          { status: 400 },
        );
      }
      createdAt.lte = untilDate;
    }
    where.createdAt = createdAt;
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(transactions);
}
