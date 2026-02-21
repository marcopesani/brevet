import { User } from "@/lib/models/user";
import { CHAIN_CONFIGS } from "@/lib/chain-config";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";

/**
 * Get the list of enabled chain IDs for a user.
 * Returns an empty array if the user is not found.
 */
export async function getUserEnabledChains(userId: string): Promise<number[]> {
  await connectDB();
  const user = await User.findById(new Types.ObjectId(userId))
    .select("enabledChains")
    .lean();
  return user?.enabledChains ?? [];
}

/**
 * Set the enabled chain IDs for a user.
 * Validates that all chain IDs exist in CHAIN_CONFIGS.
 * Throws if any chain ID is unknown.
 */
export async function setUserEnabledChains(
  userId: string,
  chainIds: number[],
): Promise<number[]> {
  const unknown = chainIds.filter((id) => !(id in CHAIN_CONFIGS));
  if (unknown.length > 0) {
    throw new Error(`Unknown chain IDs: ${unknown.join(", ")}`);
  }

  await connectDB();
  const doc = await User.findByIdAndUpdate(
    new Types.ObjectId(userId),
    { $set: { enabledChains: chainIds } },
    { returnDocument: "after" },
  )
    .select("enabledChains")
    .lean();

  if (!doc) {
    throw new Error(`User not found: ${userId}`);
  }

  return doc.enabledChains;
}

/**
 * Check if a specific chain is enabled for a user.
 */
export async function isChainEnabledForUser(
  userId: string,
  chainId: number,
): Promise<boolean> {
  const chains = await getUserEnabledChains(userId);
  return chains.includes(chainId);
}
