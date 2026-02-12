import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/policy?userId=...
 * Fetch the current spending policy for a user.
 */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

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
 * Update a user's spending policy.
 * Body: { userId, perRequestLimit?, perHourLimit?, perDayLimit?, whitelistedEndpoints?, blacklistedEndpoints? }
 */
export async function PUT(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, perRequestLimit, perHourLimit, perDayLimit, whitelistedEndpoints, blacklistedEndpoints } = body as {
    userId?: string;
    perRequestLimit?: number;
    perHourLimit?: number;
    perDayLimit?: number;
    whitelistedEndpoints?: string[];
    blacklistedEndpoints?: string[];
  };

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

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
