import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSmartAccountBalance, getAllSmartAccounts } from "@/lib/data/smart-account";
import { CHAIN_CONFIGS } from "@/lib/chain-config";
import { resolveChainParam, textContent, jsonContent, toolError } from "../shared";

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
          } catch (e) {
            return textContent(`Error: ${(e as Error).message}`, true);
          }

          const result = await getSmartAccountBalance(userId, chainId);

          if (!result) {
            return textContent(
              `No smart account found on chain ${chainId}`,
            );
          }

          const chainConfig = CHAIN_CONFIGS[chainId];

          return jsonContent({
            chain: chainConfig?.chain.name ?? `Chain ${chainId}`,
            chainId,
            smartAccountAddress: result.address,
            usdcBalance: result.balance,
          });
        }

        const accounts = await getAllSmartAccounts(userId);

        if (!accounts || accounts.length === 0) {
          return textContent(
            "No smart accounts found for this user on any chain.",
          );
        }

        const balances = await Promise.all(
          accounts.map(async (account) => {
            const result = await getSmartAccountBalance(userId, account.chainId);
            const chainConfig = CHAIN_CONFIGS[account.chainId];
            return {
              chain: chainConfig?.chain.name ?? `Chain ${account.chainId}`,
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
