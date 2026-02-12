import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createHotWallet } from "@/lib/hot-wallet";

export async function POST(request: NextRequest) {
  try {
    const { walletAddress } = await request.json();

    if (!walletAddress || typeof walletAddress !== "string") {
      return NextResponse.json(
        { error: "walletAddress is required" },
        { status: 400 },
      );
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { walletAddress },
      include: { hotWallet: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { walletAddress },
        include: { hotWallet: true },
      });
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
