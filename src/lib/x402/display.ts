import { formatUnits } from "viem";
import { getChainById, getTokenConfig } from "@/lib/chain-config";

/**
 * Resolve decimals and symbol for an asset on a chain.
 * Only matches known token addresses per chain via the token registry;
 * no default decimals for other tokens.
 */
export function getDecimalsAndSymbol(
  chainId: number,
  asset: string | undefined | null,
): { decimals: number; symbol: string } {
  if (asset) {
    const config = getChainById(chainId);
    if (config) {
      const token = getTokenConfig(chainId, asset);
      if (token) {
        return { decimals: token.decimals, symbol: token.symbol };
      }
    }
  }
  return { decimals: 18, symbol: "?" };
}

/**
 * Format a raw token amount for display using asset and chain.
 * Returns display string and symbol; no default decimals except for unknown tokens (18).
 */
export function formatAmountForDisplay(
  amountRaw: string | undefined | null,
  asset: string | undefined | null,
  chainId: number,
): { displayAmount: string; symbol: string } {
  const { decimals, symbol } = getDecimalsAndSymbol(chainId, asset);
  if (amountRaw == null || amountRaw === "") {
    return { displayAmount: "—", symbol };
  }
  try {
    const value = BigInt(amountRaw);
    const displayAmount = formatUnits(value, decimals);
    return { displayAmount, symbol };
  } catch {
    return { displayAmount: "—", symbol };
  }
}
