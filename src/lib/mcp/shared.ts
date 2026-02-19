import { isChainSupported } from "@/lib/chain-config";

/**
 * Map friendly chain names to chain IDs.
 * Also accepts numeric chain IDs as strings (e.g. "42161" → 42161).
 */
export const CHAIN_NAME_TO_ID: Record<string, number> = {
  ethereum: 1,
  eth: 1,
  mainnet: 1,
  "eth-mainnet": 1,
  sepolia: 11155111,
  "eth-sepolia": 11155111,
  base: 8453,
  "base-sepolia": 84532,
  arbitrum: 42161,
  "arbitrum-sepolia": 421614,
  optimism: 10,
  "op-sepolia": 11155420,
  polygon: 137,
  "polygon-amoy": 80002,
};

export function resolveChainParam(chain: string): number {
  const lower = chain.toLowerCase().trim();

  const byName = CHAIN_NAME_TO_ID[lower];
  if (byName !== undefined) return byName;

  const asNumber = parseInt(lower, 10);
  if (!isNaN(asNumber) && isChainSupported(asNumber)) return asNumber;

  throw new Error(
    `Unsupported chain "${chain}". Supported: ${Object.keys(CHAIN_NAME_TO_ID).join(", ")} or numeric chain IDs.`,
  );
}

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function textContent(text: string, isError?: boolean): ToolResult {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError && { isError: true }),
  };
}

export function jsonContent(obj: unknown, isError?: boolean): ToolResult {
  return textContent(JSON.stringify(obj, null, 2), isError);
}

export function toolError(
  error: unknown,
  fallback = "Operation failed",
): ToolResult {
  const message =
    error instanceof Error ? error.message : fallback;
  return textContent(`Error: ${message}`, true);
}
