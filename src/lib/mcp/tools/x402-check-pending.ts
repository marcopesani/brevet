import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getPendingPayment,
  expirePendingPayment,
} from "@/lib/data/payments";
import { CHAIN_CONFIGS } from "@/lib/chain-config";
import { formatAmountForDisplay } from "@/lib/x402/display";
import { textContent, jsonContent, toolError } from "../shared";

export function registerX402CheckPending(
  server: McpServer,
  userId: string,
): void {
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
          return textContent("Error: Pending payment not found", true);
        }

        if (
          payment.status === "pending" &&
          new Date() > payment.expiresAt
        ) {
          await expirePendingPayment(paymentId, userId);
          return jsonContent({
            status: "expired",
            message: "Payment approval has expired",
          });
        }

        if (payment.status === "completed") {
          return jsonContent({
            status: "completed",
            message:
              "Payment is complete. Use x402_get_result to retrieve the response data.",
            paymentId: payment.id,
          });
        }

        if (payment.status === "failed") {
          return jsonContent({
            status: "failed",
            message:
              "Payment failed. Use x402_get_result for error details.",
            paymentId: payment.id,
          });
        }

        if (payment.status === "approved") {
          return jsonContent({
            status: "processing",
            message:
              "Payment is signed and settlement is in progress. Check again shortly.",
          });
        }

        if (payment.status === "rejected") {
          return jsonContent({
            status: "rejected",
            message: "Payment was rejected by the user.",
          });
        }

        const timeRemaining = Math.max(
          0,
          Math.floor(
            (payment.expiresAt.getTime() - Date.now()) / 1000,
          ),
        );

        const paymentChainId = payment.chainId;
        const paymentChainConfig = paymentChainId
          ? CHAIN_CONFIGS[paymentChainId]
          : undefined;
        const amountRaw = payment.amountRaw;
        const asset = payment.asset;
        const chainIdForDisplay = paymentChainId ?? 8453;
        const { displayAmount, symbol } = formatAmountForDisplay(amountRaw, asset, chainIdForDisplay);

        return jsonContent({
          id: payment.id,
          status: payment.status,
          amountRaw: amountRaw ?? null,
          asset: asset ?? null,
          amountDisplay: displayAmount !== "—" ? `${displayAmount} ${symbol}` : null,
          url: payment.url,
          ...(paymentChainId !== undefined && {
            chainId: paymentChainId,
            chain:
              paymentChainConfig?.chain.name ?? `Chain ${paymentChainId}`,
          }),
          timeRemainingSeconds: timeRemaining,
        });
      } catch (error) {
        return toolError(error, "Failed to check pending payment");
      }
    },
  );
}
