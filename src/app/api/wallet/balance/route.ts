import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUsdcBalance } from "@/lib/hot-wallet";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const limited = rateLimit(getClientIp(request), 30);
  if (limited) return limited;

  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = auth;

  try {
    // Look up the user's hot wallet address
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { hotWallet: true },
    });

    if (!user || !user.hotWallet) {
      return NextResponse.json(
        { error: "Hot wallet not found" },
        { status: 404 },
      );
    }

    const address = user.hotWallet.address;
    const balance = await getUsdcBalance(address);
    return NextResponse.json({ balance, address });
  } catch (error) {
    console.error("Failed to fetch balance:", error);
    return NextResponse.json(
      { error: "Failed to fetch balance" },
      { status: 500 },
    );
  }
}
