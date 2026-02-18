import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executePayment } from "@/lib/x402/payment";
import { createPendingPayment, getPendingPayment, expirePendingPayment } from "@/lib/data/payments";
import { getSpendingHistory } from "@/lib/data/transactions";
import { getUserWithWalletAndPolicies, getAllHotWallets } from "@/lib/data/wallet";
import { getUsdcBalance } from "@/lib/hot-wallet";
import { CHAIN_CONFIGS, isChainSupported } from "@/lib/chain-config";

/**
 * Map friendly chain names to chain IDs.
 * Also accepts numeric chain IDs as strings (e.g. "42161" → 42161).
 */
const CHAIN_NAME_TO_ID: Record<string, number> = {
  base: 8453,
  "base-sepolia": 84532,
  arbitrum: 42161,
  "arbitrum-sepolia": 421614,
  optimism: 10,
  "op-sepolia": 11155420,
  polygon: 137,
  "polygon-amoy": 80002,
};

function resolveChainParam(chain: string): number {
  const lower = chain.toLowerCase().trim();

  // Try name lookup first
  const byName = CHAIN_NAME_TO_ID[lower];
  if (byName !== undefined) return byName;

  // Try parsing as numeric chain ID
  const asNumber = parseInt(lower, 10);
  if (!isNaN(asNumber) && isChainSupported(asNumber)) return asNumber;

  throw new Error(
    `Unsupported chain "${chain}". Supported: ${Object.keys(CHAIN_NAME_TO_ID).join(", ")} or numeric chain IDs.`,
  );
}


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
        "Make an HTTP request to an x402-protected URL. If the server responds with HTTP 402 (Payment Required), automatically handle the payment flow using the user's hot wallet and per-endpoint policy, then retry the request with payment proof. Each endpoint has its own policy controlling whether hot wallet or WalletConnect signing is used. Non-402 responses are returned directly. Supports multiple chains (Base, Arbitrum, Optimism, Polygon + testnets). If no chain is specified, the gateway auto-selects the best chain based on the endpoint's accepted networks and the user's balances.",
      inputSchema: {
        url: z.string().max(2048).url().describe("The URL to request"),
        method: z
          .enum(["GET", "POST", "PUT", "DELETE", "PATCH"])
          .optional()
          .describe(
            "HTTP method to use for the request. Defaults to GET. The x402 payment flow works with any method — the same method, body, and headers are used for both the initial request and the paid retry.",
          ),
        body: z
          .string()
          .max(1_048_576)
          .optional()
          .describe("Request body (for POST, PUT, PATCH). Sent on both the initial and paid retry requests."),
        headers: z
          .record(z.string().max(256), z.string().max(8192))
          .optional()
          .describe("Additional HTTP headers to include in the request."),
        chain: z
          .string()
          .max(64)
          .optional()
          .describe(
            'Chain to pay on. Use a name ("base", "arbitrum", "optimism", "polygon", "base-sepolia", "arbitrum-sepolia", "op-sepolia", "polygon-amoy") or a numeric chain ID ("42161"). If omitted, the gateway auto-selects the best chain.',
          ),
      },
    },
    async ({ url, method, body, headers, chain }) => {
      try {
        let chainId: number | undefined;
        if (chain) {
          try {
            chainId = resolveChainParam(chain);
          } catch (e) {
            return {
              content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
              isError: true,
            };
          }
        }

        const result = await executePayment(url, userId, { method: method ?? "GET", body, headers }, chainId);

        // Handle pending_approval status (WalletConnect tier)
        const resultAny = result as unknown as Record<string, unknown>;
        if (resultAny.status === "pending_approval") {
          const pendingResult = resultAny as {
            status: string;
            paymentRequirements: string;
            amount: number;
            chainId?: number;
          };

          // Create a pending payment record
          const pendingPayment = await createPendingPayment({
            userId,
            url,
            method: method ?? "GET",
            amount: pendingResult.amount,
            chainId: pendingResult.chainId,
            paymentRequirements: pendingResult.paymentRequirements,
            body,
            headers,
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
        "Check the user's hot wallet USDC balance. If no chain is specified, returns balances across ALL chains where the user has a wallet. If a chain is specified, returns only that chain's balance. Also lists per-endpoint policies.",
      inputSchema: {
        chain: z
          .string()
          .max(64)
          .optional()
          .describe(
            'Chain to check balance on. Use a name ("base", "arbitrum", "optimism", "polygon") or a numeric chain ID. If omitted, returns balances for all chains.',
          ),
      },
    },
    async ({ chain }) => {
      try {
        if (chain) {
          // Single-chain balance query
          let chainId: number;
          try {
            chainId = resolveChainParam(chain);
          } catch (e) {
            return {
              content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
              isError: true,
            };
          }

          const user = await getUserWithWalletAndPolicies(userId, chainId);

          if (!user) {
            return {
              content: [{ type: "text" as const, text: "Error: User not found" }],
              isError: true,
            };
          }

          if (!user.hotWallet) {
            return {
              content: [{ type: "text" as const, text: `No hot wallet found on chain ${chainId}` }],
            };
          }

          const balance = await getUsdcBalance(user.hotWallet.address, chainId);
          const chainConfig = CHAIN_CONFIGS[chainId];

          const result = {
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
          };

          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        }

        // Multi-chain: query all wallets
        const wallets = await getAllHotWallets(userId);

        if (!wallets || wallets.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No hot wallets found for this user on any chain." }],
          };
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

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ balances }, null, 2) }],
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
            'Chain to filter transactions by. Use a name ("base", "arbitrum", "optimism", "polygon") or a numeric chain ID. If omitted, returns transactions across all chains.',
          ),
      },
    },
    async ({ since, chain }) => {
      try {
        let chainId: number | undefined;
        if (chain) {
          try {
            chainId = resolveChainParam(chain);
          } catch (e) {
            return {
              content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
              isError: true,
            };
          }
        }

        const transactions = await getSpendingHistory(userId, {
          ...(since && { since: new Date(since) }),
          ...(chainId !== undefined && { chainId }),
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
        "Check the status of a pending payment that requires user approval via WalletConnect. Use this to poll for approval after x402_pay returns a pending_approval status. Once the payment is completed or failed, use x402_get_result to retrieve the full response data. Returns chain information (chainId) for each payment.",
      inputSchema: {
        paymentId: z
          .string()
          .max(64)
          .describe("The pending payment ID returned by x402_pay"),
      },
    },
    async ({ paymentId }) => {
      try {
        const payment = await getPendingPayment(paymentId, userId);

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

        // Handle completed status
        if (payment.status === "completed") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    status: "completed",
                    message: "Payment is complete. Use x402_get_result to retrieve the response data.",
                    paymentId: payment.id,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Handle failed status
        if (payment.status === "failed") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    status: "failed",
                    message: "Payment failed. Use x402_get_result for error details.",
                    paymentId: payment.id,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Handle approved status (settlement in progress)
        if (payment.status === "approved") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    status: "processing",
                    message: "Payment is signed and settlement is in progress. Check again shortly.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Handle rejected status
        if (payment.status === "rejected") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    status: "rejected",
                    message: "Payment was rejected by the user.",
                  },
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

        const paymentChainId = (payment as unknown as Record<string, unknown>).chainId as number | undefined;
        const paymentChainConfig = paymentChainId ? CHAIN_CONFIGS[paymentChainId] : undefined;

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
                  ...(paymentChainId !== undefined && {
                    chainId: paymentChainId,
                    chain: paymentChainConfig?.chain.name ?? `Chain ${paymentChainId}`,
                  }),
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

  // --- x402_get_result: Retrieve the result of a pending payment ---
  server.registerTool(
    "x402_get_result",
    {
      description:
        "Retrieves the result of a previously initiated x402 payment. Call this after the user confirms they have signed the payment in the dashboard. Returns the protected resource data if payment is complete, or the current status if still pending.",
      inputSchema: {
        paymentId: z
          .string()
          .max(64)
          .describe("The payment ID returned by x402_pay"),
      },
    },
    async ({ paymentId }) => {
      try {
        const payment = await getPendingPayment(paymentId, userId);

        if (!payment) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Payment not found",
              },
            ],
            isError: true,
          };
        }

        if (payment.status === "completed") {
          let data: unknown = payment.responsePayload;
          if (typeof payment.responsePayload === "string") {
            try {
              data = JSON.parse(payment.responsePayload);
            } catch {
              // Not JSON, keep as text
            }
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    status: "completed",
                    responseStatus: payment.responseStatus,
                    data,
                    txHash: payment.txHash,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        if (payment.status === "pending") {
          if (new Date() > payment.expiresAt) {
            await expirePendingPayment(paymentId);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      status: "expired",
                      message:
                        "Payment approval has expired. Initiate a new payment with x402_pay.",
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          const timeRemainingSeconds = Math.max(
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
                    status: "awaiting_signature",
                    message:
                      "Payment not yet signed. Ask the user to approve it in the dashboard.",
                    timeRemainingSeconds,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        if (payment.status === "approved") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    status: "processing",
                    message:
                      "Payment is signed and being processed. Try again shortly.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        if (payment.status === "failed") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    status: "failed",
                    responseStatus: payment.responseStatus,
                    error: payment.responsePayload,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        if (payment.status === "rejected") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    status: "rejected",
                    message: "Payment was rejected by the user.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        if (payment.status === "expired") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    status: "expired",
                    message:
                      "Payment approval has expired. Initiate a new payment with x402_pay.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Fallback for any unknown status
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { status: payment.status, message: "Unknown payment status" },
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
            : "Failed to retrieve payment result";
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
        "Search the CDP Bazaar discovery API for available x402-protected endpoints. Returns a list of endpoints with their URL, description, price, network, and payment scheme. Endpoints may support multiple chains (Base, Arbitrum, Optimism, Polygon + testnets). Use the 'network' filter to find endpoints on a specific chain.",
      inputSchema: {
        query: z
          .string()
          .max(256)
          .optional()
          .describe(
            "Keyword to filter endpoints by description or URL",
          ),
        network: z
          .string()
          .max(64)
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
