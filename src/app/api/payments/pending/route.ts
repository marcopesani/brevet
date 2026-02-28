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

  const chainIdParam = request.nextUrl.searchParams.get("chainId");
  const chainId = chainIdParam ? parseInt(chainIdParam, 10) : undefined;
  const includeExpired = request.nextUrl.searchParams.get("includeExpired") === "true";
  const options: { chainId?: number; includeExpired?: boolean } = {};
  if (chainId !== undefined && !isNaN(chainId)) options.chainId = chainId;
  if (includeExpired) options.includeExpired = true;

  const payments = await getPendingPayments(auth.userId, Object.keys(options).length > 0 ? options : undefined);

  return NextResponse.json(payments);
}
