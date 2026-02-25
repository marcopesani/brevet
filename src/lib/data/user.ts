import { cache } from "react";
import { User } from "@/lib/models/user";
import { CHAIN_CONFIGS } from "@/lib/chain-config";
import { connectDB } from "@/lib/db";
import {
  serializeUser,
  validateUserEnabledChainsUpdate,
} from "@/lib/models/user";
import { toObjectId } from "@/lib/models/zod-utils";

/**
 * Get the list of enabled chain IDs for a user.
 * Returns an empty array if the user is not found.
 * Wrapped with React cache() to deduplicate within a single server request.
 */
export const getUserEnabledChains = cache(
  async (userId: string): Promise<number[]> => {
    await connectDB();
    const user = await User.findById(toObjectId(userId, "userId"));
    if (!user) return [];
    return serializeUser(user).enabledChains;
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
  const validated = validateUserEnabledChainsUpdate({ enabledChains: chainIds });
  const unknown = chainIds.filter((id) => !(id in CHAIN_CONFIGS));
  if (unknown.length > 0) {
    throw new Error(`Unknown chain IDs: ${unknown.join(", ")}`);
  }

  await connectDB();
  const doc = await User.findByIdAndUpdate(
    toObjectId(userId, "userId"),
    { $set: { enabledChains: validated.enabledChains } },
    { returnDocument: "after" },
  );

  if (!doc) {
    throw new Error(`User not found: ${userId}`);
  }

  return serializeUser(doc).enabledChains;
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
