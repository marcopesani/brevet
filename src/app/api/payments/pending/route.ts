import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * GET /api/payments/pending?userId=...
 * List pending payments for a user (status=pending, not expired).
 */
export async function GET(request: NextRequest) {
  const limited = rateLimit(getClientIp(request), 30);
  if (limited) return limited;

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const payments = await prisma.pendingPayment.findMany({
    where: {
      userId,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(payments);
}

/**
 * POST /api/payments/pending
 * Create a new pending payment (called internally when x402_pay detects a WC-tier payment).
 * Body: { userId, url, method?, amount, paymentRequirements }
 */
export async function POST(request: NextRequest) {
  const postLimited = rateLimit(getClientIp(request), 10);
  if (postLimited) return postLimited;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, url, method, amount, paymentRequirements } = body as {
    userId?: string;
    url?: string;
    method?: string;
    amount?: number;
    paymentRequirements?: string;
  };

  if (!userId || !url || amount === undefined || !paymentRequirements) {
    return NextResponse.json(
      { error: "userId, url, amount, and paymentRequirements are required" },
      { status: 400 },
    );
  }

  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive number" },
      { status: 400 },
    );
  }

  // Validate paymentRequirements is valid JSON
  try {
    JSON.parse(paymentRequirements);
  } catch {
    return NextResponse.json(
      { error: "paymentRequirements must be a valid JSON string" },
      { status: 400 },
    );
  }

  const payment = await prisma.pendingPayment.create({
    data: {
      userId,
      url,
      method: method ?? "GET",
      amount,
      paymentRequirements,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minute TTL
    },
  });

  return NextResponse.json(payment, { status: 201 });
}
