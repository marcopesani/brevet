import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getAuthenticatedUser } from "@/lib/auth";

/**
 * POST /api/policies/[id]/archive
 * Archive an endpoint policy (soft-delete).
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

  if (existing.status === "archived") {
    return NextResponse.json(
      { error: "Policy is already archived" },
      { status: 400 },
    );
  }

  const policy = await prisma.endpointPolicy.update({
    where: { id },
    data: { status: "archived", archivedAt: new Date() },
  });

  return NextResponse.json(policy);
}
