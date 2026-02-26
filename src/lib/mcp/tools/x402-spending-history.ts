import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSpendingHistory } from "@/lib/data/transactions";
import { resolveChainParam, validateChainEnabled, textContent, jsonContent, toolError } from "../shared";

export function registerX402SpendingHistory(
  server: McpServer,
  userId: string,
): void {
  server.registerTool(
    "x402_spending_history",
    {
      description:
        "Query the user's x402 payment transaction history, optionally filtered by a start date and/or chain.",
      inputSchema: {
        since: z
          .string()
          .max(30)
          .optional()
          .describe(
            "ISO 8601 date string to filter transactions from (e.g. '2024-01-01T00:00:00Z')",
          ),
        chain: z
          .string()
          .max(64)
          .optional()
          .describe(
            'Chain to filter transactions by. Use a name ("ethereum", "base", "arbitrum", "optimism", "polygon") or a numeric chain ID. If omitted, returns transactions across all chains.',
          ),
      },
    },
    async ({ since, chain }) => {
      try {
        let chainId: number | undefined;
        if (chain) {
          try {
            chainId = resolveChainParam(chain);
            await validateChainEnabled(userId, chainId);
          } catch (e) {
            return textContent(`Error: ${(e as Error).message}`, true);
          }
        }

        const transactions = await getSpendingHistory(userId, {
          ...(since && { since: new Date(since) }),
          ...(chainId !== undefined && { chainId }),
        });

        return jsonContent({
          count: transactions.length,
          transactions: transactions.map((tx) => ({
            _id: tx._id,
            amount: tx.amount,
            endpoint: tx.endpoint,
            txHash: tx.txHash,
            network: tx.network,
            status: tx.status,
            createdAt: tx.createdAt,
          })),
        });
      } catch (error) {
        return toolError(error, "Failed to fetch spending history");
      }
    },
  );
}
