import { getChainConfig, getDefaultChainConfig } from "@/lib/chain-config";

export const CHAIN_COOKIE_NAME = "brevet-active-chain";

/**
 * Parses the active chain ID from the Cookie header (server-side only).
 * Returns the default chain ID if the cookie is missing or invalid.
 */
export function getInitialChainIdFromCookie(cookieHeader: string | null): number {
  if (!cookieHeader) return getDefaultChainConfig().chain.id;
  const match = cookieHeader.match(new RegExp(`${CHAIN_COOKIE_NAME}=(\\d+)`));
  if (!match) return getDefaultChainConfig().chain.id;
  const parsed = parseInt(match[1], 10);
  return getChainConfig(parsed) ? parsed : getDefaultChainConfig().chain.id;
}
