import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executePayment } from "@/lib/x402/payment";
import { createPendingPayment, getPendingPayment, expirePendingPayment } from "@/lib/data/payments";
import { getSpendingHistory } from "@/lib/data/transactions";
import { getUserWithWalletAndPolicies } from "@/lib/data/wallet";
import { getUsdcBalance } from "@/lib/hot-wallet";


const DISCOVERY_API_URL =
  "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources";

export interface DiscoveryItem {
  resource: string;
  type: string;
  x402Version: number;
  lastUpdated: string;
  metadata: Record<string, unknown>;
  accepts: Array<{
    description: string;
    maxAmountRequired: string;
    network: string;
    scheme: string;
    resource: string;
    payTo: string;
    asset: string;
    [key: string]: unknown;
  }>;
}

export interface DiscoveryResponse {
  items: DiscoveryItem[];
  pagination: { limit: number; offset: number; total: number };
  x402Version: number;
}

export function registerTools(server: McpServer, userId: string) {
  // --- x402_pay: Make an HTTP request, handle 402 payment flow ---
  server.registerTool(
    "x402_pay",
    {
      description:
        "Make an HTTP request to an x402-protected URL. If the server responds with HTTP 402 (Payment Required), automatically handle the payment flow using the user's hot wallet and per-endpoint policy, then retry the request with payment proof. Each endpoint has its own policy controlling whether hot wallet or WalletConnect signing is used. Non-402 responses are returned directly.",
      inputSchema: {
        url: z.string().url().describe("The URL to request"),
        method: z
          .enum(["GET", "POST", "PUT", "DELETE", "PATCH"])
          .optional()
          .describe(
            "HTTP method to use for the request. Defaults to GET. The x402 payment flow works with any method — the same method, body, and headers are used for both the initial request and the paid retry.",
          ),
        body: z
          .string()
          .optional()
          .describe("Request body (for POST, PUT, PATCH). Sent on both the initial and paid retry requests."),
        headers: z
          .record(z.string(), z.string())
          .optional()
          .describe("Additional HTTP headers to include in the request."),
      },
    },
    async ({ url, method, body, headers }) => {
      try {
        const result = await executePayment(url, userId, { method: method ?? "GET", body, headers });

        // Handle pending_approval status (WalletConnect tier)
        const resultAny = result as unknown as Record<string, unknown>;
        if (resultAny.status === "pending_approval") {
          const pendingResult = resultAny as {
            status: string;
            paymentRequirements: string;
            amount: number;
          };

          // Create a pending payment record
          const pendingPayment = await createPendingPayment({
            userId,
            url,
            method: method ?? "GET",
            amount: pendingResult.amount,
            paymentRequirements: pendingResult.paymentRequirements,
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
                  ...(result.settlement && {
                    settlement: {
                      transaction: result.settlement.transaction,
                      network: result.settlement.network,
                      success: result.settlement.success,
                      payer: result.settlement.payer,
                    },
                  }),
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

  // --- x402_check_balance: Check wallet balance and active endpoint policies ---
  server.registerTool(
    "x402_check_balance",
    {
      description:
        "Check the user's hot wallet USDC balance on Base and list their per-endpoint policies.",
    },
    async () => {
      try {
        const user = await getUserWithWalletAndPolicies(userId);

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

        const endpointPolicies = user.endpointPolicies.map((policy) => ({
          id: policy.id,
          endpointPattern: policy.endpointPattern,
          payFromHotWallet: policy.payFromHotWallet,
          status: policy.status,
        }));

        const result = {
          walletAddress: user.hotWallet.address,
          usdcBalance: balance,
          endpointPolicies,
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
        const transactions = await getSpendingHistory(userId, {
          ...(since && { since: new Date(since) }),
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
        const payment = await getPendingPayment(paymentId);

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
          await expirePendingPayment(paymentId);
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

  // --- x402_discover: Search the CDP Bazaar for x402-protected endpoints ---
  server.registerTool(
    "x402_discover",
    {
      description:
        "Search the CDP Bazaar discovery API for available x402-protected endpoints. Returns a list of endpoints with their URL, description, price, network, and payment scheme.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            "Keyword to filter endpoints by description or URL",
          ),
        network: z
          .string()
          .optional()
          .describe(
            'Network to filter by (e.g., "base", "base-sepolia", "eip155:8453")',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum number of results to return (default 20)"),
      },
    },
    async ({ query, network, limit }) => {
      try {
        const maxResults = limit ?? 20;

        const url = new URL(DISCOVERY_API_URL);
        url.searchParams.set("limit", String(maxResults));

        const response = await fetch(url.toString());

        if (!response.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Discovery API returned HTTP ${response.status}`,
              },
            ],
            isError: true,
          };
        }

        const data: DiscoveryResponse = await response.json();

        if (!data.items || !Array.isArray(data.items)) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Unexpected response format from discovery API",
              },
            ],
            isError: true,
          };
        }

        let items = data.items;

        // Client-side filtering by network
        if (network) {
          const networkLower = network.toLowerCase();
          items = items.filter((item) =>
            item.accepts.some(
              (a) => a.network.toLowerCase() === networkLower,
            ),
          );
        }

        // Client-side filtering by keyword
        if (query) {
          const queryLower = query.toLowerCase();
          items = items.filter((item) => {
            const resourceMatch = item.resource
              .toLowerCase()
              .includes(queryLower);
            const descMatch = item.accepts.some((a) =>
              a.description.toLowerCase().includes(queryLower),
            );
            return resourceMatch || descMatch;
          });
        }

        if (items.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No endpoints found matching your query.",
              },
            ],
          };
        }

        const endpoints = items.map((item) => {
          const accept = item.accepts[0];
          return {
            url: item.resource,
            description: accept?.description ?? "No description",
            price: accept
              ? `${(Number(accept.maxAmountRequired) / 1e6).toFixed(6)} USDC`
              : "Unknown",
            network: accept?.network ?? "Unknown",
            scheme: accept?.scheme ?? "Unknown",
          };
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { count: endpoints.length, endpoints },
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
            : "Failed to query discovery API";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
