import { cache } from "react";
import { User, parseUserEnabledChainsProjection } from "@/lib/models/user";
import { CHAIN_CONFIGS } from "@/lib/chain-config";
import { parseObjectId } from "@/lib/models/zod";
import { connectDB } from "@/lib/db";

/**
 * Get the list of enabled chain IDs for a user.
 * Returns an empty array if the user is not found.
 * Wrapped with React cache() to deduplicate within a single server request.
 */
export const getUserEnabledChains = cache(
  async (userId: string): Promise<number[]> => {
    await connectDB();
    const user = await User.findById(parseObjectId(userId, "userId"))
      .select("enabledChains")
      .lean();
    if (!user) return [];
    return parseUserEnabledChainsProjection(user).enabledChains ?? [];
  },
);

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
    parseObjectId(userId, "userId"),
    { $set: { enabledChains: chainIds } },
    { returnDocument: "after", runValidators: true },
  )
    .select("enabledChains")
    .lean();

  if (!doc) {
    throw new Error(`User not found: ${userId}`);
  }

  return parseUserEnabledChainsProjection(doc).enabledChains ?? [];
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
