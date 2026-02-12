import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { prisma } from "@/lib/db";
import { withdrawFromHotWallet } from "@/lib/hot-wallet";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getAuthenticatedUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const limited = rateLimit(getClientIp(request), 5);
  if (limited) return limited;

  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = auth;

  try {
    const { amount, toAddress } = await request.json();

    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 },
      );
    }

    if (!toAddress || !isAddress(toAddress)) {
      return NextResponse.json(
        { error: "Valid toAddress is required" },
        { status: 400 },
      );
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { hotWallet: true },
    });

    if (!user || !user.hotWallet) {
      return NextResponse.json(
        { error: "User or hot wallet not found" },
        { status: 404 },
      );
    }

    const result = await withdrawFromHotWallet(userId, amount, toAddress);

    return NextResponse.json({
      txHash: result.txHash,
      amount,
    });
  } catch (error) {
    console.error("Withdrawal failed:", error);
    const message =
      error instanceof Error ? error.message : "Withdrawal failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
