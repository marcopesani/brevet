import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSmartAccountBalance, getAllSmartAccounts } from "@/lib/data/smart-account";
import { getChainById } from "@/lib/chain-config";
import { resolveChainParam, validateChainEnabled, getUserEnabledChains, textContent, jsonContent, toolError } from "../shared";

export function registerX402CheckBalance(
  server: McpServer,
  userId: string,
): void {
  server.registerTool(
    "x402_check_balance",
    {
      description:
        "Check the user's smart account USDC balance. If no chain is specified, returns balances across ALL chains where the user has a smart account. If a chain is specified, returns only that chain's balance. Chains without a smart account are indicated.",
      inputSchema: {
        chain: z
          .string()
          .max(64)
          .optional()
          .describe(
            'Chain to check balance on. Use a name ("ethereum", "base", "arbitrum", "optimism", "polygon") or a numeric chain ID. If omitted, returns balances for all chains.',
          ),
      },
    },
    async ({ chain }) => {
      try {
        if (chain) {
          let chainId: number;
          try {
            chainId = resolveChainParam(chain);
            await validateChainEnabled(userId, chainId);
          } catch (e) {
            return textContent(`Error: ${(e as Error).message}`, true);
          }

          const result = await getSmartAccountBalance(userId, chainId);

          if (!result) {
            return textContent(
              `No smart account found on chain ${chainId}`,
            );
          }

          const chainConfig = getChainById(chainId);

          return jsonContent({
            chain: chainConfig?.displayName ?? `Chain ${chainId}`,
            chainId,
            smartAccountAddress: result.address,
            usdcBalance: result.balance,
          });
        }

        const enabledChains = await getUserEnabledChains(userId);

        if (enabledChains.length === 0) {
          return textContent(
            "No chains are enabled for your account. Enable chains in Settings.",
          );
        }

        const accounts = await getAllSmartAccounts(userId);

        // Filter to only enabled chains
        const enabledAccounts = accounts?.filter(
          (account) => enabledChains.includes(account.chainId),
        ) ?? [];

        if (enabledAccounts.length === 0) {
          return textContent(
            "No smart accounts found on any enabled chain.",
          );
        }

        const balances = await Promise.all(
          enabledAccounts.map(async (account) => {
            const result = await getSmartAccountBalance(userId, account.chainId);
            const chainConfig = getChainById(account.chainId);
            return {
              chain: chainConfig?.displayName ?? `Chain ${account.chainId}`,
              chainId: account.chainId,
              balance: result?.balance ?? "0",
              address: account.smartAccountAddress,
            };
          }),
        );

        return jsonContent({ balances });
      } catch (error) {
        return toolError(error, "Failed to check balance");
      }
    },
  );
}
