"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  getPendingPayments as _getPendingPayments,
  getPendingCount as _getPendingCount,
  getPendingPayment as _getPendingPayment,
  approvePendingPayment as _approvePendingPayment,
  rejectPendingPayment as _rejectPendingPayment,
  expirePendingPayment as _expirePendingPayment,
  completePendingPayment,
  failPendingPayment,
} from "@/lib/data/payments";
import { createTransaction } from "@/lib/data/transactions";
import { buildPaymentHeaders, extractSettleResponse, extractTxHashFromResponse } from "@/lib/x402/headers";
import { formatAmountForDisplay } from "@/lib/x402/display";
import { getRequirementAmount } from "@/lib/x402/requirements";
import { getChainById, getDefaultChainConfig, getNetworkIdentifiers } from "@/lib/chain-config";
import { logger } from "@/lib/logger";
import { safeFetch } from "@/lib/safe-fetch";
import {
  deserializePendingPaymentRequestHeaders,
  deserializePendingPaymentRequirements,
} from "@/lib/models/pending-payment";
import { deserializeTransactionResponsePayload } from "@/lib/models/transaction";
import type { Hex } from "viem";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";

export async function getPendingPayments() {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");
  return _getPendingPayments(auth.userId);
}

export async function getPendingCount() {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");
  return _getPendingCount(auth.userId);
}

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
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const payment = await _getPendingPayment(paymentId, auth.userId);
  if (!payment) throw new Error("Pending payment not found");
  if (payment.status !== "pending") throw new Error(`Payment is already ${payment.status}`);

  if (new Date() > payment.expiresAt) {
    logger.warn("Payment expired during approval", { userId: auth.userId, paymentId, action: "payment_expired" });
    await _expirePendingPayment(paymentId, auth.userId);
    throw new Error("Payment has expired");
  }

  const storedPaymentRequired = deserializePendingPaymentRequirements(
    payment.paymentRequirements,
  ) as Record<string, unknown> | unknown[];

  // Backward compat: old records stored just the accepts array, new records store full PaymentRequired
  const isFullFormat =
    !Array.isArray(storedPaymentRequired) &&
    "accepts" in storedPaymentRequired;
  const accepts = isFullFormat
    ? (storedPaymentRequired.accepts as unknown[])
    : Array.isArray(storedPaymentRequired)
      ? storedPaymentRequired
      : [storedPaymentRequired];

  // Resolve the requirement that matches the payment's chainId (same logic as the card)
  const chainId = payment.chainId ?? getDefaultChainConfig().chain.id;
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

  const x402Version = isFullFormat
    ? ((storedPaymentRequired.x402Version as number | undefined) ?? 1)
    : 1;
  const resource = isFullFormat
    ? (storedPaymentRequired.resource as PaymentPayload["resource"])
    : { url: payment.url, description: "", mimeType: "" };
  const extensions = isFullFormat
    ? (storedPaymentRequired.extensions as PaymentPayload["extensions"])
    : undefined;

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

  // Include stored request headers and body in the paid fetch
  const storedHeaders: Record<string, string> =
    deserializePendingPaymentRequestHeaders(payment.requestHeaders);

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

    // Mark as approved with signature first (transitional state)
    const approved = await _approvePendingPayment(paymentId, auth.userId, signature);
    if (!approved) {
      throw new Error("Payment has already been processed");
    }

    // Read response body for storage
    let responsePayload: string | null = null;
    try {
      responsePayload = await paidResponse.clone().text();
    } catch {
      // If reading fails, leave as null
    }

    // Extract txHash from response headers
    const settlement = extractSettleResponse(paidResponse) ?? undefined;
    const txHash = settlement?.transaction ?? await extractTxHashFromResponse(paidResponse);

    const txStatus = paidResponse.ok ? "completed" : "failed";

    await createTransaction({
      amount: amountForTx,
      endpoint: payment.url,
      network: acceptedRequirement?.network ?? "base",
      status: txStatus,
      userId: payment.userId,
      txHash: txHash ?? undefined,
      responsePayload,
      errorMessage: !paidResponse.ok ? `Payment approved but server responded with ${paidResponse.status}` : undefined,
      responseStatus: paidResponse.status,
    });

    // Store response on the PendingPayment record
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

    // Parse response data for the return value
    let responseData: unknown = null;
    const contentType = paidResponse.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      responseData = deserializeTransactionResponsePayload(responsePayload);
    } else {
      responseData = responsePayload;
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/pending");
    revalidatePath("/dashboard/transactions");

    return {
      success: paidResponse.ok,
      status: paidResponse.status,
      data: responseData,
    };
  } catch (error) {
    // Network error — create a failed transaction and mark PendingPayment as failed
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
      status: "failed",
      userId: payment.userId,
      errorMessage: `Network error: ${errorMsg}`,
    });

    await failPendingPayment(paymentId, auth.userId, {
      error: `Network error: ${errorMsg}`,
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/pending");
    revalidatePath("/dashboard/transactions");

    return {
      success: false,
      status: 0,
      data: null,
    };
  }
}

export async function rejectPendingPayment(paymentId: string) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const payment = await _getPendingPayment(paymentId, auth.userId);
  if (!payment) throw new Error("Pending payment not found");
  if (payment.status !== "pending") throw new Error(`Payment is already ${payment.status}`);

  const rejected = await _rejectPendingPayment(paymentId, auth.userId);
  if (!rejected) {
    throw new Error("Payment has already been processed");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/pending");

  return { success: true, status: "rejected" };
}
