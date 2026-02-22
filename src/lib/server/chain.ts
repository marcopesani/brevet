import "server-only";
import { getInitialChainIdFromCookie } from "@/lib/chain-cookie";
import { resolveValidChainId } from "@/lib/chain-config";
import { getUserEnabledChains } from "@/lib/data/user";

/**
 * Gets the validated chain ID for a user by checking the cookie against
 * their enabled chains. Falls back to the first enabled chain if the
 * cookie chain is not in the user's enabled set.
 */
export async function getValidatedChainId(
  cookieHeader: string | null,
  userId: string,
): Promise<number> {
  const raw = getInitialChainIdFromCookie(cookieHeader);
  const enabled = await getUserEnabledChains(userId);
  return resolveValidChainId(raw, enabled);
}
