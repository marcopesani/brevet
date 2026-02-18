import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/user";
import { ensureAllHotWallets, getHotWallet } from "@/lib/data/wallet";

// Hardhat account #0 — deterministic test address
const TEST_WALLET_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

export async function POST() {
  console.log("[BREVET:dev-login] POST called");
  if (process.env.NEXT_PUBLIC_TEST_MODE !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  await connectDB();

  let user = await User.findOne({ walletAddress: TEST_WALLET_ADDRESS });
  if (!user) {
    user = await User.create({ walletAddress: TEST_WALLET_ADDRESS });
    console.log(`[BREVET:dev-login] Created new user — id=${user._id.toString()}`);
  } else {
    console.log(`[BREVET:dev-login] Found existing user — id=${user._id.toString()}`);
  }

  const created = await ensureAllHotWallets(user._id.toString());
  console.log(`[BREVET:dev-login] ensureAllHotWallets completed — created=${created}`);

  const hotWallet = await getHotWallet(user._id.toString());
  console.log(`[BREVET:dev-login] Default-chain hot wallet — address=${hotWallet?.address ?? "none"}`);

  const response = {
    userId: user._id.toString(),
    walletAddress: TEST_WALLET_ADDRESS,
    hotWalletAddress: hotWallet?.address ?? null,
  };
  console.log(`[BREVET:dev-login] Returning response — userId=${response.userId}, hotWallet=${response.hotWalletAddress}`);
  return NextResponse.json(response);
}
