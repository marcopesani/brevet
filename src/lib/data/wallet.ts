import { Types } from "mongoose";
import { User } from "@/lib/models/user";
import { HotWallet } from "@/lib/models/hot-wallet";
import { EndpointPolicy } from "@/lib/models/endpoint-policy";
import { connectDB } from "@/lib/db";
import { createHotWallet as createHotWalletKeys, getUsdcBalance, withdrawFromHotWallet as withdrawHotWallet } from "@/lib/hot-wallet";
import { getEnvironmentChains } from "@/lib/chain-config";

const DEFAULT_CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || "8453",
  10,
);

/**
 * Get the user's hot wallet balance and address for a specific chain.
 * Returns null if the user has no hot wallet on that chain.
 */
export async function getWalletBalance(userId: string, chainId?: number) {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);
  const resolvedChainId = chainId ?? DEFAULT_CHAIN_ID;

  const user = await User.findById(userObjectId).lean();
  if (!user) {
    return null;
  }

  const hotWallet = await HotWallet.findOne({ userId: userObjectId, chainId: resolvedChainId }).lean();
  if (!hotWallet) {
    return null;
  }

  const balance = await getUsdcBalance(hotWallet.address, resolvedChainId);
  return { balance, address: hotWallet.address };
}

/**
 * Ensure a hot wallet exists for the user on a specific chain. Creates one if needed.
 * Returns the wallet address and userId.
 */
export async function ensureHotWallet(userId: string, chainId?: number) {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);
  const resolvedChainId = chainId ?? DEFAULT_CHAIN_ID;

  const user = await User.findById(userObjectId).lean();
  if (!user) {
    return null;
  }

  const existingWallet = await HotWallet.findOne({ userId: userObjectId, chainId: resolvedChainId }).lean();
  if (existingWallet) {
    return { address: existingWallet.address, userId: user._id.toString() };
  }

  const { address, encryptedPrivateKey } = createHotWalletKeys();

  await HotWallet.create({
    address,
    encryptedPrivateKey,
    userId: userObjectId,
    chainId: resolvedChainId,
  });

  return { address, userId: user._id.toString() };
}

/**
 * Ensure the user has a hot wallet on every environment-appropriate chain.
 * Skips chains where a wallet already exists. Returns the number of wallets created.
 */
export async function ensureAllHotWallets(userId: string): Promise<number> {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const user = await User.findById(userObjectId).lean();
  if (!user) return 0;

  const chains = getEnvironmentChains();
  const existingWallets = await HotWallet.find({ userId: userObjectId }).lean();
  const existingChainIds = new Set(existingWallets.map((w) => w.chainId));

  const missing = chains.filter((c) => !existingChainIds.has(c.chain.id));
  if (missing.length === 0) return 0;

  const docs = missing.map((c) => {
    const { address, encryptedPrivateKey } = createHotWalletKeys();
    return { address, encryptedPrivateKey, userId: userObjectId, chainId: c.chain.id };
  });

  await HotWallet.insertMany(docs);
  return docs.length;
}

/**
 * Withdraw USDC from the user's hot wallet to a destination address on a specific chain.
 */
export async function withdrawFromWallet(
  userId: string,
  amount: number,
  toAddress: string,
  chainId?: number,
) {
  return withdrawHotWallet(userId, amount, toAddress, chainId);
}

/**
 * Get the user's hot wallet record for a specific chain (used by payment.ts for private key access).
 * Returns null if not found.
 */
export async function getHotWallet(userId: string, chainId?: number) {
  await connectDB();
  const resolvedChainId = chainId ?? DEFAULT_CHAIN_ID;
  const doc = await HotWallet.findOne({ userId: new Types.ObjectId(userId), chainId: resolvedChainId }).lean();
  if (!doc) return null;
  return { ...doc, id: doc._id.toString() };
}

/**
 * Get all hot wallets for a user across all chains (used by MCP check_balance multi-chain query).
 */
export async function getAllHotWallets(userId: string) {
  await connectDB();
  const docs = await HotWallet.find({ userId: new Types.ObjectId(userId) }).lean();
  return docs.map((doc) => ({
    ...doc,
    id: doc._id.toString(),
    address: doc.address,
    chainId: doc.chainId,
  }));
}

/**
 * Get user with hot wallet and endpoint policies (used by MCP check_balance tool).
 * When chainId is provided, returns wallet and policies for that chain only.
 */
export async function getUserWithWalletAndPolicies(userId: string, chainId?: number) {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);
  const resolvedChainId = chainId ?? DEFAULT_CHAIN_ID;

  const user = await User.findById(userObjectId).lean();
  if (!user) return null;

  const hotWallet = await HotWallet.findOne({ userId: userObjectId, chainId: resolvedChainId }).lean();
  const endpointPolicies = await EndpointPolicy.find({ userId: userObjectId }).lean();

  return {
    ...user,
    id: user._id.toString(),
    hotWallet: hotWallet ? { ...hotWallet, id: hotWallet._id.toString() } : null,
    endpointPolicies: endpointPolicies.map((p) => ({ ...p, id: p._id.toString() })),
  };
}
