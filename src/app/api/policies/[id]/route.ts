import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getAuthenticatedUser } from "@/lib/auth";

/**
 * GET /api/policies/[id]
 * Fetch a single endpoint policy by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(getClientIp(request), 30);
  if (limited) return limited;

  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = auth;

  const { id } = await params;

  const policy = await prisma.endpointPolicy.findUnique({
    where: { id },
  });

  if (!policy) {
    return NextResponse.json(
      { error: "Policy not found" },
      { status: 404 },
    );
  }

  if (policy.userId !== userId) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  return NextResponse.json(policy);
}

/**
 * PUT /api/policies/[id]
 * Update an existing endpoint policy.
 * Body: { endpointPattern?, payFromHotWallet?, status? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const putLimited = rateLimit(getClientIp(request), 10);
  if (putLimited) return putLimited;

  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = auth;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const existing = await prisma.endpointPolicy.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Policy not found" },
      { status: 404 },
    );
  }

  if (existing.userId !== userId) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 },
    );
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

  // If endpointPattern is being changed, check for conflicts
  if (endpointPattern !== undefined) {
    if (typeof endpointPattern !== "string" || endpointPattern.length === 0) {
      return NextResponse.json(
        { error: "endpointPattern must be a non-empty string" },
        { status: 400 },
      );
    }
    if (endpointPattern !== existing.endpointPattern) {
      const conflict = await prisma.endpointPolicy.findUnique({
        where: { userId_endpointPattern: { userId, endpointPattern } },
      });
      if (conflict) {
        return NextResponse.json(
          { error: "A policy for this endpoint pattern already exists" },
          { status: 409 },
        );
      }
    }
  }

  const data: Record<string, unknown> = {};
  if (endpointPattern !== undefined) data.endpointPattern = endpointPattern;
  if (payFromHotWallet !== undefined) data.payFromHotWallet = payFromHotWallet;
  if (status !== undefined) data.status = status;

  const policy = await prisma.endpointPolicy.update({
    where: { id },
    data,
  });

  return NextResponse.json(policy);
}
