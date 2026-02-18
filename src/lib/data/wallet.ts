import { Types } from "mongoose";
import { User } from "@/lib/models/user";
import { HotWallet } from "@/lib/models/hot-wallet";
import { EndpointPolicy } from "@/lib/models/endpoint-policy";
import { connectDB } from "@/lib/db";
import { createHotWallet as createHotWalletKeys, getUsdcBalance, withdrawFromHotWallet as withdrawHotWallet } from "@/lib/hot-wallet";

/**
 * Get the user's hot wallet balance and address.
 * Returns null if the user has no hot wallet.
 */
export async function getWalletBalance(userId: string) {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const user = await User.findById(userObjectId).lean();
  if (!user) {
    return null;
  }

  const hotWallet = await HotWallet.findOne({ userId: userObjectId }).lean();
  if (!hotWallet) {
    return null;
  }

  const balance = await getUsdcBalance(hotWallet.address);
  return { balance, address: hotWallet.address };
}

/**
 * Ensure a hot wallet exists for the user. Creates one if needed.
 * Returns the wallet address and userId.
 */
export async function ensureHotWallet(userId: string) {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const user = await User.findById(userObjectId).lean();
  if (!user) {
    return null;
  }

  const existingWallet = await HotWallet.findOne({ userId: userObjectId }).lean();
  if (existingWallet) {
    return { address: existingWallet.address, userId: user._id.toString() };
  }

  const { address, encryptedPrivateKey } = createHotWalletKeys();

  await HotWallet.create({
    address,
    encryptedPrivateKey,
    userId: userObjectId,
  });

  return { address, userId: user._id.toString() };
}

/**
 * Withdraw USDC from the user's hot wallet to a destination address.
 */
export async function withdrawFromWallet(
  userId: string,
  amount: number,
  toAddress: string,
) {
  return withdrawHotWallet(userId, amount, toAddress);
}

/**
 * Get the user's hot wallet record (used by payment.ts for private key access).
 * Returns null if not found.
 */
export async function getHotWallet(userId: string) {
  await connectDB();
  const doc = await HotWallet.findOne({ userId: new Types.ObjectId(userId) }).lean();
  if (!doc) return null;
  return { ...doc, id: doc._id.toString() };
}

/**
 * Get user with hot wallet and endpoint policies (used by MCP check_balance tool).
 */
export async function getUserWithWalletAndPolicies(userId: string) {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const user = await User.findById(userObjectId).lean();
  if (!user) return null;

  const hotWallet = await HotWallet.findOne({ userId: userObjectId }).lean();
  const endpointPolicies = await EndpointPolicy.find({ userId: userObjectId }).lean();

  return {
    ...user,
    id: user._id.toString(),
    hotWallet: hotWallet ? { ...hotWallet, id: hotWallet._id.toString() } : null,
    endpointPolicies: endpointPolicies.map((p) => ({ ...p, id: p._id.toString() })),
  };
}
