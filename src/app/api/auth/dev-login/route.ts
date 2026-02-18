import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/user";
import { HotWallet } from "@/lib/models/hot-wallet";
import { createHotWallet } from "@/lib/hot-wallet";

// Hardhat account #0 — deterministic test address
const TEST_WALLET_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

export async function POST() {
  if (process.env.NEXT_PUBLIC_TEST_MODE !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  await connectDB();

  let user = await User.findOne({ walletAddress: TEST_WALLET_ADDRESS });
  if (!user) {
    user = await User.create({ walletAddress: TEST_WALLET_ADDRESS });
  }

  let hotWallet = await HotWallet.findOne({ userId: user._id });
  if (!hotWallet) {
    const { address, encryptedPrivateKey } = createHotWallet();
    hotWallet = await HotWallet.create({
      address,
      encryptedPrivateKey,
      userId: user._id,
    });
  }

  return NextResponse.json({
    userId: user._id.toString(),
    walletAddress: TEST_WALLET_ADDRESS,
    hotWalletAddress: hotWallet.address,
  });
}
