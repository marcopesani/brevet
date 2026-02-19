import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executePayment } from "@/lib/x402/payment";
import { createPendingPayment } from "@/lib/data/payments";
import { resolveChainParam, textContent, jsonContent, toolError } from "../shared";

export function registerX402Pay(server: McpServer, userId: string): void {
  server.registerTool(
    "x402_pay",
    {
      description:
        "Make an HTTP request to an x402-protected URL. If the server responds with HTTP 402 (Payment Required), automatically handle the payment flow using the user's hot wallet and per-endpoint policy, then retry the request with payment proof. Each endpoint has its own policy controlling whether hot wallet or WalletConnect signing is used. Non-402 responses are returned directly. Supports multiple chains (Ethereum, Base, Arbitrum, Optimism, Polygon + testnets). If no chain is specified, the gateway auto-selects the best chain based on the endpoint's accepted networks and the user's balances.",
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
            'Chain to pay on. Use a name ("ethereum", "base", "arbitrum", "optimism", "polygon", "sepolia", "base-sepolia", "arbitrum-sepolia", "op-sepolia", "polygon-amoy") or a numeric chain ID ("42161"). If omitted, the gateway auto-selects the best chain.',
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
            return textContent(`Error: ${(e as Error).message}`, true);
          }
        }

        const result = await executePayment(
          url,
          userId,
          { method: method ?? "GET", body, headers },
          chainId,
        );

        const resultAny = result as unknown as Record<string, unknown>;
        if (resultAny.status === "pending_approval") {
          const pendingResult = resultAny as {
            status: string;
            paymentRequirements: string;
            amount: number;
            chainId?: number;
          };

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

          return textContent(
            `Payment of $${pendingResult.amount.toFixed(6)} requires user approval. Payment ID: ${pendingPayment.id}. The user has been notified and has 30 minutes to approve. Use x402_check_pending to check the status.`,
          );
        }

        if (!result.success) {
          return textContent(`Payment failed: ${result.error}`, true);
        }

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

        return jsonContent({
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
        });
      } catch (error) {
        return toolError(error, "Payment processing failed");
      }
    },
  );
}
