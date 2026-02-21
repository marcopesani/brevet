import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/user";
import { getDefaultChainConfig } from "@/lib/chain-config";
import { ensureAllHotWallets } from "@/lib/data/wallet";
import { ensureApiKey, rotateApiKey } from "@/lib/data/users";

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

  await ensureAllHotWallets(user._id.toString());

  const ensureResult = await ensureApiKey(user._id.toString());
  const apiKey = ensureResult.created
    ? ensureResult.rawKey
    : (await rotateApiKey(user._id.toString())).rawKey;

  const defaultChainId = getDefaultChainConfig().chain.id;
  const { getHotWallet } = await import("@/lib/data/wallet");
  const hotWallet = await getHotWallet(user._id.toString(), defaultChainId);

  return NextResponse.json({
    userId: user._id.toString(),
    walletAddress: TEST_WALLET_ADDRESS,
    hotWalletAddress: hotWallet?.address ?? null,
    apiKey,
  });
}
