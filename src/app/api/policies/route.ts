import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getAuthenticatedUser } from "@/lib/auth";

/**
 * GET /api/policies
 * List endpoint policies for the authenticated user.
 * Supports optional ?status= query param to filter by status (e.g. "active", "draft", "archived").
 */
export async function GET(request: NextRequest) {
  const limited = rateLimit(getClientIp(request), 30);
  if (limited) return limited;

  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = auth;

  const statusFilter = request.nextUrl.searchParams.get("status");

  const where: { userId: string; status?: string } = { userId };
  if (statusFilter) {
    where.status = statusFilter;
  }

  const policies = await prisma.endpointPolicy.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(policies);
}

/**
 * POST /api/policies
 * Create a new endpoint policy for the authenticated user.
 * Body: { endpointPattern, payFromHotWallet?, status? }
 */
export async function POST(request: NextRequest) {
  const postLimited = rateLimit(getClientIp(request), 10);
  if (postLimited) return postLimited;

  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    endpointPattern,
    payFromHotWallet,
    status,
  } = body as {
    endpointPattern?: string;
    payFromHotWallet?: boolean;
    status?: string;
  };

  if (!endpointPattern || typeof endpointPattern !== "string") {
    return NextResponse.json(
      { error: "endpointPattern is required and must be a string" },
      { status: 400 },
    );
  }

  if (payFromHotWallet !== undefined && typeof payFromHotWallet !== "boolean") {
    return NextResponse.json(
      { error: "payFromHotWallet must be a boolean" },
      { status: 400 },
    );
  }

  if (status !== undefined && status !== "active" && status !== "draft") {
    return NextResponse.json(
      { error: 'status must be "active" or "draft"' },
      { status: 400 },
    );
  }

  // Check for duplicate endpointPattern
  const existing = await prisma.endpointPolicy.findUnique({
    where: { userId_endpointPattern: { userId, endpointPattern } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A policy for this endpoint pattern already exists" },
      { status: 409 },
    );
  }

  const policy = await prisma.endpointPolicy.create({
    data: {
      userId,
      endpointPattern,
      ...(payFromHotWallet !== undefined && { payFromHotWallet }),
      ...(status !== undefined && { status }),
    },
  });

  return NextResponse.json(policy, { status: 201 });
}
