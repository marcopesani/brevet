import { NextRequest, NextResponse } from "next/server";
import { getUsdcBalance } from "@/lib/hot-wallet";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json(
      { error: "address query parameter is required" },
      { status: 400 },
    );
  }

  try {
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
