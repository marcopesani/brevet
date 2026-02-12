import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getAuthenticatedUser } from "@/lib/auth";

/**
 * POST /api/payments/[id]/reject
 * Mark a pending payment as rejected.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(getClientIp(request), 10);
  if (limited) return limited;

  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = auth;

  const { id } = await params;

  const payment = await prisma.pendingPayment.findUnique({
    where: { id },
  });

  if (!payment) {
    return NextResponse.json(
      { error: "Pending payment not found" },
      { status: 404 },
    );
  }

  // Verify the authenticated user owns this payment
  if (payment.userId !== userId) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  if (payment.status !== "pending") {
    return NextResponse.json(
      { error: `Payment is already ${payment.status}` },
      { status: 409 },
    );
  }

  await prisma.pendingPayment.update({
    where: { id },
    data: { status: "rejected" },
  });

  return NextResponse.json({ success: true, status: "rejected" });
}
