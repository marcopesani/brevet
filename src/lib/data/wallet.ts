import { User } from "@/lib/models/user";
import {
  HotWallet,
  serializeHotWallet,
  serializeHotWalletWithKey,
  validateHotWalletCreateInput,
} from "@/lib/models/hot-wallet";
import {
  EndpointPolicy,
  serializeEndpointPolicy,
} from "@/lib/models/endpoint-policy";
import { serializeUser } from "@/lib/models/user";
import { connectDB } from "@/lib/db";
import { createHotWallet as createHotWalletKeys, getUsdcBalance } from "@/lib/hot-wallet";
import { getEnvironmentChains } from "@/lib/chain-config";
import { withdrawFromSmartAccount } from "@/lib/data/smart-account";
import { humanHash } from "@/lib/human-hash";
import { toObjectId } from "@/lib/models/zod-utils";

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
  const userObjectId = toObjectId(userId, "userId");
  const resolvedChainId = chainId ?? DEFAULT_CHAIN_ID;

  const user = await User.findById(userObjectId);
  if (!user) {
    return null;
  }

  const hotWallet = await HotWallet.findOne({ userId: userObjectId, chainId: resolvedChainId });
  if (!hotWallet) {
    return null;
  }

  const wallet = serializeHotWallet(hotWallet);
  const balance = await getUsdcBalance(wallet.address, resolvedChainId);
  return { balance, address: wallet.address };
}

/**
 * Ensure a hot wallet exists for the user on a specific chain. Creates one if needed.
 * Returns the wallet address and userId.
 */
export async function ensureHotWallet(userId: string, chainId?: number) {
  await connectDB();
  const userObjectId = toObjectId(userId, "userId");
  const resolvedChainId = chainId ?? DEFAULT_CHAIN_ID;

  const user = await User.findById(userObjectId);
  if (!user) {
    return null;
  }

  const existingWallet = await HotWallet.findOne({
    userId: userObjectId,
    chainId: resolvedChainId,
  });
  if (existingWallet) {
    const wallet = serializeHotWallet(existingWallet);
    return { address: wallet.address, userId: wallet.userId };
  }

  const { address, encryptedPrivateKey } = createHotWalletKeys();

  const validated = validateHotWalletCreateInput({
    address,
    encryptedPrivateKey,
    userId,
    chainId: resolvedChainId,
  });
  await HotWallet.create(validated);

  return { address, userId };
}

/**
 * Ensure the user has a hot wallet on every environment-appropriate chain.
 * Skips chains where a wallet already exists. Returns the number of wallets created.
 */
export async function ensureAllHotWallets(userId: string): Promise<number> {
  await connectDB();
  const userObjectId = toObjectId(userId, "userId");

  const user = await User.findById(userObjectId);
  if (!user) return 0;

  const chains = getEnvironmentChains();
  const existingWallets = await HotWallet.find({ userId: userObjectId });
  const existingChainIds = new Set(
    existingWallets.map((w) => serializeHotWallet(w).chainId),
  );

  const missing = chains.filter((c) => !existingChainIds.has(c.chain.id));
  if (missing.length === 0) return 0;

  const docs = missing.map((c) => {
    const { address, encryptedPrivateKey } = createHotWalletKeys();
    return validateHotWalletCreateInput({
      address,
      encryptedPrivateKey,
      userId,
      chainId: c.chain.id,
    });
  });

  try {
    await HotWallet.insertMany(docs, { ordered: false });
  } catch (err: unknown) {
    // Ignore duplicate key errors (code 11000) — a concurrent login already created the wallet.
    // With ordered: false, non-duplicate inserts still succeed.
    const isDuplicateKeyError =
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: number }).code === 11000;
    if (!isDuplicateKeyError) {
      throw err;
    }
  }
  return docs.length;
}

/**
 * Withdraw USDC from the user's smart account to a destination address on a specific chain.
 */
export async function withdrawFromWallet(
  userId: string,
  amount: number,
  toAddress: string,
  chainId?: number,
) {
  return withdrawFromSmartAccount(userId, amount, toAddress, chainId);
}

/**
 * Get the user's hot wallet record for a specific chain (excludes encryptedPrivateKey).
 * Use getHotWalletWithKey() when the private key is needed. Returns null if not found.
 */
export async function getHotWallet(userId: string, chainId?: number) {
  await connectDB();
  const resolvedChainId = chainId ?? DEFAULT_CHAIN_ID;
  const doc = await HotWallet.findOne({
    userId: toObjectId(userId, "userId"),
    chainId: resolvedChainId,
  });
  if (!doc) return null;
  return serializeHotWallet(doc);
}

/**
 * Get the user's hot wallet INCLUDING the encryptedPrivateKey (for payment signing and withdrawals).
 * Only use this when the private key is actually needed — prefer getHotWallet() otherwise.
 */
export async function getHotWalletWithKey(userId: string, chainId?: number) {
  await connectDB();
  const resolvedChainId = chainId ?? DEFAULT_CHAIN_ID;
  const doc = await HotWallet.findOne({
    userId: toObjectId(userId, "userId"),
    chainId: resolvedChainId,
  });
  if (!doc) return null;
  return serializeHotWalletWithKey(doc);
}

/**
 * Get all hot wallets for a user across all chains (used by MCP check_balance multi-chain query).
 */
export async function getAllHotWallets(userId: string) {
  await connectDB();
  const docs = await HotWallet.find({ userId: toObjectId(userId, "userId") });
  return docs.map((doc) => serializeHotWallet(doc));
}

/**
 * Get user with hot wallet and endpoint policies (used by MCP check_balance tool).
 * When chainId is provided, returns wallet and policies for that chain only.
 */
export async function getUserWithWalletAndPolicies(userId: string, chainId?: number) {
  await connectDB();
  const userObjectId = toObjectId(userId, "userId");
  const resolvedChainId = chainId ?? DEFAULT_CHAIN_ID;

  const user = await User.findById(userObjectId);
  if (!user) return null;

  const hotWallet = await HotWallet.findOne({
    userId: userObjectId,
    chainId: resolvedChainId,
  });
  const endpointPolicies = await EndpointPolicy.find({ userId: userObjectId });
  const serializedUser = serializeUser(user);

  return {
    ...serializedUser,
    hotWallet: hotWallet ? serializeHotWallet(hotWallet) : null,
    endpointPolicies: endpointPolicies.map((p) => serializeEndpointPolicy(p)),
  };
}

/**
 * Find or create a user by wallet address.
 * Generates a humanHash on creation. Backfills humanHash for existing users that lack one.
 */
export async function upsertUser(walletAddress: string) {
  await connectDB();

  let user = await User.findOne({ walletAddress });

  if (!user) {
    user = await User.create({ walletAddress });
    const hash = humanHash(user._id.toHexString());
    user.humanHash = hash;
    await user.save();
    return user;
  }

  if (!user.humanHash) {
    const hash = humanHash(user._id.toHexString());
    user.humanHash = hash;
    await user.save();
  }

  return user;
}

/**
 * Look up a user by their human-readable hash.
 * Returns the userId string, or null if no user matches.
 */
export async function findByHumanHash(hash: string): Promise<string | null> {
  await connectDB();
  const user = await User.findOne({ humanHash: hash });
  if (!user) return null;
  return serializeUser(user).id;
}

/**
 * Get the human-readable hash for a user by their userId.
 * Returns the humanHash string, or null if not found.
 */
export async function getUserHumanHash(userId: string): Promise<string | null> {
  await connectDB();
  const user = await User.findById(toObjectId(userId, "userId"));
  if (!user) return null;
  return serializeUser(user).humanHash ?? null;
}
