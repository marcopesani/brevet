import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * GET /api/wallet/session?userId=<walletAddress>
 *
 * Server-side session check for MCP requests. Since WalletConnect sessions
 * are managed client-side by Wagmi, this endpoint checks whether the user
 * exists in the database (has connected before) and has an active wallet.
 *
 * Returns: { status: "connected" | "disconnected", address?: string }
 */
export async function GET(request: NextRequest) {
  const limited = rateLimit(getClientIp(request), 30);
  if (limited) return limited;

  const userId = request.nextUrl.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { error: "userId query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { walletAddress: userId },
      select: { walletAddress: true },
    });

    if (!user) {
      return NextResponse.json({ status: "disconnected" });
    }

    return NextResponse.json({
      status: "connected",
      address: user.walletAddress,
    });
  } catch (error) {
    console.error("Failed to check session:", error);
    return NextResponse.json(
      { error: "Failed to check session" },
      { status: 500 },
    );
  }
}
