import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getPendingPayment,
  expirePendingPayment,
} from "@/lib/data/payments";
import { textContent, jsonContent, toolError } from "../shared";

export function registerX402GetResult(
  server: McpServer,
  userId: string,
): void {
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
          return textContent("Error: Payment not found", true);
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

          return jsonContent({
            status: "completed",
            responseStatus: payment.responseStatus,
            data,
            txHash: payment.txHash,
          });
        }

        if (payment.status === "pending") {
          if (Date.now() > new Date(payment.expiresAt).getTime()) {
            await expirePendingPayment(paymentId, userId);
            return jsonContent({
              status: "expired",
              message:
                "Payment approval has expired. Initiate a new payment with x402_pay.",
            });
          }

          const timeRemainingSeconds = Math.max(
            0,
            Math.floor(
              (new Date(payment.expiresAt).getTime() - Date.now()) / 1000,
            ),
          );

          return jsonContent({
            status: "awaiting_signature",
            message:
              "Payment not yet signed. Ask the user to approve it in the dashboard.",
            timeRemainingSeconds,
          });
        }

        if (payment.status === "approved") {
          return jsonContent({
            status: "processing",
            message:
              "Payment is signed and being processed. Try again shortly.",
          });
        }

        if (payment.status === "failed") {
          return jsonContent({
            status: "failed",
            responseStatus: payment.responseStatus,
            error: payment.responsePayload,
          });
        }

        if (payment.status === "rejected") {
          return jsonContent({
            status: "rejected",
            message: "Payment was rejected by the user.",
          });
        }

        if (payment.status === "expired") {
          return jsonContent({
            status: "expired",
            message:
              "Payment approval has expired. Initiate a new payment with x402_pay.",
          });
        }

        return jsonContent({
          status: payment.status,
          message: "Unknown payment status",
        });
      } catch (error) {
        return toolError(error, "Failed to retrieve payment result");
      }
    },
  );
}
