import { NextRequest, NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { prisma } from "@/lib/db";
import { createHotWallet } from "@/lib/hot-wallet";
import { createSession, consumeNonceCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { message, signature } = await request.json();

    if (!message || !signature) {
      return NextResponse.json(
        { error: "Missing message or signature" },
        { status: 400 },
      );
    }

    // Parse and verify the SIWE message
    const siweMessage = new SiweMessage(message);
    const result = await siweMessage.verify({ signature });

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 },
      );
    }

    // Verify nonce matches the one we issued
    const expectedNonce = await consumeNonceCookie();
    if (!expectedNonce || siweMessage.nonce !== expectedNonce) {
      return NextResponse.json(
        { error: "Invalid or expired nonce" },
        { status: 401 },
      );
    }

    const walletAddress = siweMessage.address.toLowerCase();

    // Upsert user: find by walletAddress or create new
    let user = await prisma.user.findUnique({
      where: { walletAddress },
      include: { hotWallet: true },
    });

    if (!user) {
      // Create user with hot wallet
      const { address, encryptedPrivateKey } = createHotWallet();

      user = await prisma.user.create({
        data: {
          walletAddress,
          hotWallet: {
            create: {
              address,
              encryptedPrivateKey,
            },
          },
        },
        include: { hotWallet: true },
      });
    }

    // Create JWT session
    await createSession(user.id, walletAddress);

    return NextResponse.json({
      userId: user.id,
      walletAddress: user.walletAddress,
    });
  } catch (error) {
    console.error("SIWE verification failed:", error);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 },
    );
  }
}
