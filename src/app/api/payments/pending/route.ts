import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getAuthenticatedUser } from "@/lib/auth";
import { getPendingPayments } from "@/lib/data/payments";

/**
 * GET /api/payments/pending
 * List pending payments for the authenticated user (status=pending, not expired).
 * Used by React Query polling in the dashboard.
 */
export async function GET(request: NextRequest) {
  const limited = rateLimit(getClientIp(request), 30);
  if (limited) return limited;

  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payments = await getPendingPayments(auth.userId);

  return NextResponse.json(payments);
}
