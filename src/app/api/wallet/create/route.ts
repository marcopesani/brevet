import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createHotWallet } from "@/lib/hot-wallet";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getAuthenticatedUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const limited = rateLimit(getClientIp(request), 10);
  if (limited) return limited;

  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = auth;

  try {
    // Find user with their hot wallet
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { hotWallet: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 },
      );
    }

    // Return existing hot wallet if already created (idempotent)
    if (user.hotWallet) {
      return NextResponse.json({
        address: user.hotWallet.address,
        userId: user.id,
      });
    }

    // Create new hot wallet
    const { address, encryptedPrivateKey } = createHotWallet();

    await prisma.hotWallet.create({
      data: {
        address,
        encryptedPrivateKey,
        userId: user.id,
      },
    });

    return NextResponse.json({ address, userId: user.id });
  } catch (error) {
    console.error("Failed to create hot wallet:", error);
    return NextResponse.json(
      { error: "Failed to create hot wallet" },
      { status: 500 },
    );
  }
}
