import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getUserWithWalletAndPolicies, getAllHotWallets } from "@/lib/data/wallet";
import { getUsdcBalance } from "@/lib/hot-wallet";
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
        "Check the user's hot wallet USDC balance. If no chain is specified, returns balances across ALL chains where the user has a wallet. If a chain is specified, returns only that chain's balance. Also lists per-endpoint policies.",
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

          const user = await getUserWithWalletAndPolicies(userId, chainId);

          if (!user) {
            return textContent("Error: User not found", true);
          }

          if (!user.hotWallet) {
            return textContent(
              `No hot wallet found on chain ${chainId}`,
            );
          }

          const balance = await getUsdcBalance(user.hotWallet.address, chainId);
          const chainConfig = CHAIN_CONFIGS[chainId];

          return jsonContent({
            chain: chainConfig?.chain.name ?? `Chain ${chainId}`,
            chainId,
            walletAddress: user.hotWallet.address,
            usdcBalance: balance,
            endpointPolicies: user.endpointPolicies.map((policy) => ({
              id: policy.id,
              endpointPattern: policy.endpointPattern,
              payFromHotWallet: policy.payFromHotWallet,
              status: policy.status,
            })),
          });
        }

        const wallets = await getAllHotWallets(userId);

        if (!wallets || wallets.length === 0) {
          return textContent(
            "No hot wallets found for this user on any chain.",
          );
        }

        const balances = await Promise.all(
          wallets.map(async (wallet) => {
            const balance = await getUsdcBalance(wallet.address, wallet.chainId);
            const chainConfig = CHAIN_CONFIGS[wallet.chainId];
            return {
              chain: chainConfig?.chain.name ?? `Chain ${wallet.chainId}`,
              chainId: wallet.chainId,
              balance,
              address: wallet.address,
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
