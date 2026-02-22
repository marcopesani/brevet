import { resolveChain, getAllChains, getChainById } from "@/lib/chain-config";
import { isChainEnabledForUser, getUserEnabledChains } from "@/lib/data/user";

export function resolveChainParam(chain: string): number {
  const config = resolveChain(chain);
  if (config) return config.chain.id;

  throw new Error(
    `Unsupported chain "${chain}". Supported: ${getAllChains().map((c) => c.slug).join(", ")} or numeric chain IDs.`,
  );
}

/**
 * Validate that a chain is enabled for the user. Throws if disabled.
 * This is the server-side security boundary — client-side filtering is cosmetic only.
 */
export async function validateChainEnabled(userId: string, chainId: number): Promise<void> {
  const enabled = await isChainEnabledForUser(userId, chainId);
  if (!enabled) {
    const config = getChainById(chainId);
    const name = config?.displayName ?? "Unknown";
    throw new Error(`Chain ${name} (${chainId}) is not enabled for your account. Enable it in Settings.`);
  }
}

export { getUserEnabledChains };

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
