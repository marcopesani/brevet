"use server";

import { revalidatePath } from "next/cache";
import { ok, err } from "@/lib/action-result";
import { withAuth, withAuthRead } from "@/lib/action-result-server";
import {
  getPendingPayments as _getPendingPayments,
  getPendingCount as _getPendingCount,
  getPendingPayment as _getPendingPayment,
  createPendingPayment as _createPendingPayment,
  approvePendingPayment as _approvePendingPayment,
  rejectPendingPayment as _rejectPendingPayment,
  expirePendingPayment as _expirePendingPayment,
  completePendingPayment,
  failPendingPayment,
} from "@/lib/data/payments";
import { createTransaction } from "@/lib/data/transactions";
import { ensureAutoSignPolicy } from "@/lib/data/policies";
import { executePayment } from "@/lib/x402/payment";
import { buildPaymentHeaders, extractSettleResponse, extractTxHashFromResponse } from "@/lib/x402/headers";
import { formatAmountForDisplay } from "@/lib/x402/display";
import { getRequirementAmount } from "@/lib/x402/requirements";
import { getChainById, getNetworkIdentifiers } from "@/lib/chain-config";
import { logger } from "@/lib/logger";
import { safeFetch } from "@/lib/safe-fetch";
import type { Hex } from "viem";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";

// ---------------------------------------------------------------------------
// Reads — keep throwing (consumed by Server Components / error boundaries)
// ---------------------------------------------------------------------------

export async function getPendingPayments() {
  return withAuthRead((auth) => _getPendingPayments(auth.userId));
}

export async function getPendingCount() {
  return withAuthRead((auth) => _getPendingCount(auth.userId));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RetryResult = { status: string; paymentId: string | null; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract display amount from a pending payment for transaction logging. */
function getAmountForTx(payment: { paymentRequirements: string; amountRaw: string | null; asset: string | null; chainId: number }) {
  const stored = JSON.parse(payment.paymentRequirements);
  const isFullFormat = !Array.isArray(stored) && stored.accepts;
  const accepts = isFullFormat ? stored.accepts : Array.isArray(stored) ? stored : [stored];
  const chainConfig = getChainById(payment.chainId);
  const acceptedNetworks = chainConfig ? getNetworkIdentifiers(chainConfig) : [];
  const req = accepts.find(
    (r: { scheme?: string; network?: string }) =>
      r.scheme === "exact" && r.network != null && acceptedNetworks.includes(r.network),
  ) ?? accepts[0];
  const amountRaw = (req && getRequirementAmount(req as PaymentRequirements)) ?? payment.amountRaw;
  const { displayAmount } = formatAmountForDisplay(amountRaw, req?.asset ?? payment.asset, payment.chainId);
  return { amountForTx: parseFloat(displayAmount) || 0, network: req?.network ?? "base" };
}

function revalidatePaymentPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/pending");
  revalidatePath("/dashboard/transactions");
}

// ---------------------------------------------------------------------------
// Mutations — return ActionResult<T>
// ---------------------------------------------------------------------------

export async function approvePendingPayment(
  paymentId: string,
  signature: string,
  authorization: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
  },
) {
  return withAuth(async (auth) => {
    const payment = await _getPendingPayment(paymentId, auth.userId);
    if (!payment) return err("Pending payment not found");
    if (payment.status !== "pending") return err(`Payment is already ${payment.status}`);

    if (Date.now() > new Date(payment.expiresAt).getTime()) {
      logger.warn("Payment expired during approval", { userId: auth.userId, paymentId, action: "payment_expired" });
      await _expirePendingPayment(paymentId, auth.userId);

      // Record expired transaction for audit trail
      const { amountForTx, network } = getAmountForTx(payment);
      await createTransaction({
        amount: amountForTx,
        endpoint: payment.url,
        network,
        chainId: payment.chainId,
        status: "expired",
        userId: payment.userId,
        errorMessage: "Payment expired before approval could complete",
      });

      revalidatePaymentPaths();
      return err("Payment has expired");
    }

    const storedPaymentRequired = JSON.parse(payment.paymentRequirements);

    const isFullFormat = !Array.isArray(storedPaymentRequired) && storedPaymentRequired.accepts;
    const accepts = isFullFormat
      ? storedPaymentRequired.accepts
      : Array.isArray(storedPaymentRequired)
        ? storedPaymentRequired
        : [storedPaymentRequired];

    const chainId = payment.chainId;
    const chainConfig = getChainById(chainId);
    const acceptedNetworks = chainConfig ? getNetworkIdentifiers(chainConfig) : [];
    const acceptedRequirement =
      accepts.find(
        (r: { scheme?: string; network?: string }) =>
          r.scheme === "exact" && r.network != null && acceptedNetworks.includes(r.network),
      ) ?? accepts[0];

    const amountRaw =
      (acceptedRequirement && getRequirementAmount(acceptedRequirement as PaymentRequirements)) ??
      payment.amountRaw;
    const { displayAmount } = formatAmountForDisplay(
      amountRaw,
      acceptedRequirement?.asset ?? payment.asset,
      chainId,
    );
    const amountForTx = parseFloat(displayAmount) || 0;
    logger.info("Payment approval started", { userId: auth.userId, paymentId, url: payment.url, action: "approve_started", amount: amountForTx });

    const x402Version = isFullFormat ? (storedPaymentRequired.x402Version ?? 1) : 1;
    const resource = isFullFormat
      ? storedPaymentRequired.resource
      : { url: payment.url, description: "", mimeType: "" };
    const extensions = isFullFormat ? storedPaymentRequired.extensions : undefined;

    const paymentPayload: PaymentPayload = {
      x402Version,
      resource,
      accepted: acceptedRequirement,
      payload: {
        signature: signature as Hex,
        authorization: {
          from: authorization.from as Hex,
          to: authorization.to as Hex,
          value: authorization.value,
          validAfter: authorization.validAfter,
          validBefore: authorization.validBefore,
          nonce: authorization.nonce as Hex,
        },
      },
      ...(extensions ? { extensions } : {}),
    };

    const paymentHeaders = buildPaymentHeaders(paymentPayload);

    const storedHeaders: Record<string, string> = payment.requestHeaders
      ? JSON.parse(payment.requestHeaders)
      : {};

    try {
      const paidResponse = await safeFetch(payment.url, {
        method: payment.method,
        headers: {
          ...storedHeaders,
          ...paymentHeaders,
        },
        ...(payment.requestBody ? { body: payment.requestBody } : {}),
        signal: AbortSignal.timeout(30_000),
      });

      const approved = await _approvePendingPayment(paymentId, auth.userId, signature);
      if (!approved) {
        return err("Payment has already been processed");
      }

      let responsePayload: string | null = null;
      try {
        responsePayload = await paidResponse.clone().text();
      } catch {
        // If reading fails, leave as null
      }

      const settlement = extractSettleResponse(paidResponse) ?? undefined;
      const txHash = settlement?.transaction ?? await extractTxHashFromResponse(paidResponse);

      const txStatus = paidResponse.ok ? "completed" : "failed";

      await createTransaction({
        amount: amountForTx,
        endpoint: payment.url,
        network: acceptedRequirement?.network ?? "base",
        chainId,
        status: txStatus,
        userId: payment.userId,
        txHash: txHash ?? undefined,
        responsePayload,
        errorMessage: !paidResponse.ok ? `Payment approved but server responded with ${paidResponse.status}` : undefined,
        responseStatus: paidResponse.status,
      });

      if (paidResponse.ok) {
        logger.info("Payment approval completed", { userId: auth.userId, paymentId, url: payment.url, action: "approve_completed", status: paidResponse.status, txHash });
        await completePendingPayment(paymentId, auth.userId, {
          responsePayload: responsePayload ?? "",
          responseStatus: paidResponse.status,
          txHash: txHash ?? undefined,
        });
      } else {
        logger.error("Payment approval failed - server returned error", { userId: auth.userId, paymentId, url: payment.url, action: "approve_failed", status: paidResponse.status, responseBody: responsePayload?.slice(0, 500) });
        await failPendingPayment(paymentId, auth.userId, {
          responsePayload: responsePayload ?? undefined,
          responseStatus: paidResponse.status,
        });
      }

      let responseData: unknown = null;
      const contentType = paidResponse.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        try {
          responseData = JSON.parse(responsePayload ?? "");
        } catch {
          responseData = responsePayload;
        }
      } else {
        responseData = responsePayload;
      }

      revalidatePaymentPaths();

      if (!paidResponse.ok) {
        return err(`Payment approved but server responded with ${paidResponse.status}`);
      }

      return ok({ status: paidResponse.status, data: responseData });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Network error during payment";

      logger.error("Network error during payment approval", {
        userId: auth.userId,
        paymentId,
        url: payment.url,
        action: "payment_network_error",
        error: errorMsg,
      });

      await createTransaction({
        amount: amountForTx,
        endpoint: payment.url,
        network: acceptedRequirement?.network ?? "base",
        chainId,
        status: "failed",
        userId: payment.userId,
        errorMessage: `Network error: ${errorMsg}`,
      });

      await failPendingPayment(paymentId, auth.userId, {
        error: `Network error: ${errorMsg}`,
      });

      revalidatePaymentPaths();

      return err(`Network error: ${errorMsg}`);
    }
  });
}

export async function rejectPendingPayment(paymentId: string) {
  return withAuth(async (auth) => {
    const payment = await _getPendingPayment(paymentId, auth.userId);
    if (!payment) return err("Pending payment not found");
    if (payment.status !== "pending" && payment.status !== "expired") {
      return err(`Payment is already ${payment.status}`);
    }

    const rejected = await _rejectPendingPayment(paymentId, auth.userId);
    if (!rejected) return err("Payment has already been processed");

    revalidatePaymentPaths();

    return ok(undefined as void);
  });
}

// ---------------------------------------------------------------------------
// Expire — marks pending payment as expired and records transaction
// ---------------------------------------------------------------------------

export async function expirePendingPaymentAction(paymentId: string) {
  return withAuth(async (auth) => {
    const payment = await _getPendingPayment(paymentId, auth.userId);
    if (!payment) return err("Pending payment not found");
    if (payment.status !== "pending") return ok(undefined as void);

    const expired = await _expirePendingPayment(paymentId, auth.userId);
    if (!expired) return ok(undefined as void);

    const { amountForTx, network } = getAmountForTx(payment);
    await createTransaction({
      amount: amountForTx,
      endpoint: payment.url,
      network,
      chainId: payment.chainId,
      status: "expired",
      userId: payment.userId,
      errorMessage: "Payment expired before user approval",
    });

    revalidatePaymentPaths();
    return ok(undefined as void);
  });
}

// ---------------------------------------------------------------------------
// Retry — shared flow for retryExpiredPayment and enableAutoSignAndRetry
// ---------------------------------------------------------------------------

async function retryPaymentFlow(
  paymentId: string,
  userId: string,
  options?: { enableAutoSign?: boolean },
) {
  const payment = await _getPendingPayment(paymentId, userId);
  if (!payment) return err("Pending payment not found");
  if (payment.status !== "expired" && payment.status !== "pending") {
    return err(`Cannot retry: payment is ${payment.status}`);
  }

  if (options?.enableAutoSign) {
    await ensureAutoSignPolicy(userId, payment.url, payment.chainId);
    logger.info("Auto-sign policy enabled for retry", { userId, url: payment.url, chainId: payment.chainId, action: "auto_sign_enabled" });
  }

  const storedHeaders: Record<string, string> = payment.requestHeaders
    ? JSON.parse(payment.requestHeaders)
    : {};

  const result = await executePayment(
    payment.url,
    userId,
    {
      method: payment.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
      body: payment.requestBody ?? undefined,
      headers: Object.keys(storedHeaders).length > 0 ? storedHeaders : undefined,
    },
    payment.chainId,
  );

  if (result.status === "pending_approval") {
    const expiresAt = new Date(Date.now() + result.maxTimeoutSeconds * 1000);
    const newPayment = await _createPendingPayment({
      userId,
      url: payment.url,
      method: payment.method,
      amountRaw: result.amountRaw,
      asset: result.asset,
      chainId: result.chainId,
      paymentRequirements: result.paymentRequirements,
      expiresAt,
      body: payment.requestBody ?? undefined,
      headers: Object.keys(storedHeaders).length > 0 ? storedHeaders : undefined,
    });

    revalidatePaymentPaths();

    const message = options?.enableAutoSign
      ? "Auto-sign enabled for this endpoint. This payment still requires manual approval (no active session key or insufficient balance)."
      : "New payment created — approve it before it expires.";
    return ok<RetryResult>({ status: "pending_approval", paymentId: newPayment._id, message });
  }

  if (!result.success) {
    revalidatePaymentPaths();
    return err(result.error ?? "Payment failed");
  }

  // Auto-sign path: executePayment already created the transaction
  revalidatePaymentPaths();
  return ok<RetryResult>({ status: "completed", paymentId: null, message: "Payment completed successfully." });
}

export async function retryExpiredPayment(paymentId: string) {
  return withAuth((auth) => retryPaymentFlow(paymentId, auth.userId));
}

export async function enableAutoSignAndRetry(paymentId: string) {
  return withAuth((auth) => retryPaymentFlow(paymentId, auth.userId, { enableAutoSign: true }));
}
