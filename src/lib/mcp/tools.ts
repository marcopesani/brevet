import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executePayment } from "@/lib/x402/payment";
import { prisma } from "@/lib/db";
import { getUsdcBalance } from "@/lib/hot-wallet";

export function registerTools(server: McpServer, userId: string) {
  // --- x402_pay: Make an HTTP request, handle 402 payment flow ---
  server.registerTool(
    "x402_pay",
    {
      description:
        "Make an HTTP request to an x402-protected URL. If the server responds with HTTP 402 (Payment Required), automatically handle the payment flow using the user's hot wallet and spending policy, then retry the request with payment proof. Non-402 responses are returned directly.",
      inputSchema: {
        url: z.string().url().describe("The URL to request"),
        method: z
          .enum(["GET", "POST", "PUT", "DELETE", "PATCH"])
          .optional()
          .describe(
            "HTTP method (currently only GET is supported for x402 payment flow)",
          ),
        body: z
          .string()
          .optional()
          .describe("Request body (reserved for future use)"),
        headers: z
          .record(z.string(), z.string())
          .optional()
          .describe("Additional HTTP headers (reserved for future use)"),
      },
    },
    async ({ url }) => {
      try {
        const result = await executePayment(url, userId);

        // Handle pending_approval status (WalletConnect tier)
        const resultAny = result as unknown as Record<string, unknown>;
        if (resultAny.status === "pending_approval") {
          const pendingResult = resultAny as {
            status: string;
            paymentRequirements: string;
            amount: number;
          };

          // Create a pending payment record
          const pendingPayment = await prisma.pendingPayment.create({
            data: {
              userId,
              url,
              amount: pendingResult.amount,
              paymentRequirements: pendingResult.paymentRequirements,
              expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min TTL
            },
          });

          return {
            content: [
              {
                type: "text" as const,
                text: `Payment of $${pendingResult.amount.toFixed(6)} requires user approval. Payment ID: ${pendingPayment.id}. The user has been notified and has 30 minutes to approve. Use x402_check_pending to check the status.`,
              },
            ],
          };
        }

        if (!result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Payment failed: ${result.error}`,
              },
            ],
            isError: true,
          };
        }

        // Serialize the Response for MCP tool output
        let responseData: unknown = null;
        if (result.response) {
          const contentType =
            result.response.headers.get("content-type") ?? "";
          if (contentType.includes("application/json")) {
            responseData = await result.response.json();
          } else {
            responseData = await result.response.text();
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  status: result.response?.status,
                  data: responseData,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Payment processing failed";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- x402_check_balance: Check wallet balance and remaining budget ---
  server.registerTool(
    "x402_check_balance",
    {
      description:
        "Check the user's hot wallet USDC balance on Base and remaining spending budget based on their policy limits.",
    },
    async () => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { hotWallet: true, spendingPolicy: true },
        });

        if (!user) {
          return {
            content: [
              { type: "text" as const, text: "Error: User not found" },
            ],
            isError: true,
          };
        }

        if (!user.hotWallet) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: No hot wallet configured for this user",
              },
            ],
            isError: true,
          };
        }

        const balance = await getUsdcBalance(user.hotWallet.address);

        // Calculate remaining budget from policy
        let budgetRemaining = null;
        if (user.spendingPolicy) {
          const now = new Date();
          const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
          const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

          const recentTransactions = await prisma.transaction.findMany({
            where: {
              userId,
              status: { not: "failed" },
              createdAt: { gte: oneDayAgo },
            },
            select: { amount: true, createdAt: true },
          });

          const hourlySpend = recentTransactions
            .filter((tx) => tx.createdAt >= oneHourAgo)
            .reduce((sum, tx) => sum + tx.amount, 0);

          const dailySpend = recentTransactions.reduce(
            (sum, tx) => sum + tx.amount,
            0,
          );

          budgetRemaining = {
            perRequest: user.spendingPolicy.perRequestLimit,
            hourly: Math.max(
              0,
              user.spendingPolicy.perHourLimit - hourlySpend,
            ),
            daily: Math.max(0, user.spendingPolicy.perDayLimit - dailySpend),
          };
        }

        const result = {
          walletAddress: user.hotWallet.address,
          usdcBalance: balance,
          budgetRemaining,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to check balance";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- x402_spending_history: Query transaction history ---
  server.registerTool(
    "x402_spending_history",
    {
      description:
        "Query the user's x402 payment transaction history, optionally filtered by a start date.",
      inputSchema: {
        since: z
          .string()
          .optional()
          .describe(
            "ISO 8601 date string to filter transactions from (e.g. '2024-01-01T00:00:00Z')",
          ),
      },
    },
    async ({ since }) => {
      try {
        const where: { userId: string; createdAt?: { gte: Date } } = {
          userId,
        };
        if (since) {
          where.createdAt = { gte: new Date(since) };
        }

        const transactions = await prisma.transaction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 100,
        });

        const result = {
          count: transactions.length,
          transactions: transactions.map((tx) => ({
            id: tx.id,
            amount: tx.amount,
            endpoint: tx.endpoint,
            txHash: tx.txHash,
            network: tx.network,
            status: tx.status,
            createdAt: tx.createdAt.toISOString(),
          })),
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to fetch spending history";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- x402_check_pending: Check status of a pending payment ---
  server.registerTool(
    "x402_check_pending",
    {
      description:
        "Check the status of a pending payment that requires user approval via WalletConnect. Use this to poll for approval after x402_pay returns a pending_approval status.",
      inputSchema: {
        paymentId: z
          .string()
          .describe("The pending payment ID returned by x402_pay"),
      },
    },
    async ({ paymentId }) => {
      try {
        const payment = await prisma.pendingPayment.findUnique({
          where: { id: paymentId },
        });

        if (!payment) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Pending payment not found",
              },
            ],
            isError: true,
          };
        }

        // Check if expired
        if (
          payment.status === "pending" &&
          new Date() > payment.expiresAt
        ) {
          await prisma.pendingPayment.update({
            where: { id: paymentId },
            data: { status: "expired" },
          });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { status: "expired", message: "Payment approval has expired" },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const timeRemaining = Math.max(
          0,
          Math.floor(
            (payment.expiresAt.getTime() - Date.now()) / 1000,
          ),
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  id: payment.id,
                  status: payment.status,
                  amount: payment.amount,
                  url: payment.url,
                  timeRemainingSeconds: timeRemaining,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to check pending payment";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
