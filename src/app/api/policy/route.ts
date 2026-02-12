import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getAuthenticatedUser } from "@/lib/auth";

/**
 * GET /api/policy
 * Fetch the current spending policy for the authenticated user.
 */
export async function GET(request: NextRequest) {
  const limited = rateLimit(getClientIp(request), 30);
  if (limited) return limited;

  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = auth;

  const policy = await prisma.spendingPolicy.findUnique({
    where: { userId },
  });

  if (!policy) {
    return NextResponse.json(
      { error: "No spending policy found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    id: policy.id,
    perRequestLimit: policy.perRequestLimit,
    perHourLimit: policy.perHourLimit,
    perDayLimit: policy.perDayLimit,
    whitelistedEndpoints: JSON.parse(policy.whitelistedEndpoints),
    blacklistedEndpoints: JSON.parse(policy.blacklistedEndpoints),
  });
}

/**
 * PUT /api/policy
 * Update the authenticated user's spending policy.
 * Body: { perRequestLimit?, perHourLimit?, perDayLimit?, whitelistedEndpoints?, blacklistedEndpoints? }
 */
export async function PUT(request: NextRequest) {
  const putLimited = rateLimit(getClientIp(request), 10);
  if (putLimited) return putLimited;

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

  const { perRequestLimit, perHourLimit, perDayLimit, whitelistedEndpoints, blacklistedEndpoints } = body as {
    perRequestLimit?: number;
    perHourLimit?: number;
    perDayLimit?: number;
    whitelistedEndpoints?: string[];
    blacklistedEndpoints?: string[];
  };

  // Validate numeric limits
  const limits = { perRequestLimit, perHourLimit, perDayLimit };
  for (const [key, value] of Object.entries(limits)) {
    if (value !== undefined) {
      if (typeof value !== "number" || value < 0) {
        return NextResponse.json(
          { error: `${key} must be a non-negative number` },
          { status: 400 },
        );
      }
    }
  }

  // Validate endpoint lists
  if (whitelistedEndpoints !== undefined && !Array.isArray(whitelistedEndpoints)) {
    return NextResponse.json(
      { error: "whitelistedEndpoints must be an array of strings" },
      { status: 400 },
    );
  }
  if (blacklistedEndpoints !== undefined && !Array.isArray(blacklistedEndpoints)) {
    return NextResponse.json(
      { error: "blacklistedEndpoints must be an array of strings" },
      { status: 400 },
    );
  }

  // Upsert the policy
  const data: Record<string, unknown> = {};
  if (perRequestLimit !== undefined) data.perRequestLimit = perRequestLimit;
  if (perHourLimit !== undefined) data.perHourLimit = perHourLimit;
  if (perDayLimit !== undefined) data.perDayLimit = perDayLimit;
  if (whitelistedEndpoints !== undefined)
    data.whitelistedEndpoints = JSON.stringify(whitelistedEndpoints);
  if (blacklistedEndpoints !== undefined)
    data.blacklistedEndpoints = JSON.stringify(blacklistedEndpoints);

  const policy = await prisma.spendingPolicy.upsert({
    where: { userId },
    update: data,
    create: {
      userId,
      ...data,
    },
  });

  return NextResponse.json({
    id: policy.id,
    perRequestLimit: policy.perRequestLimit,
    perHourLimit: policy.perHourLimit,
    perDayLimit: policy.perDayLimit,
    whitelistedEndpoints: JSON.parse(policy.whitelistedEndpoints),
    blacklistedEndpoints: JSON.parse(policy.blacklistedEndpoints),
  });
}
