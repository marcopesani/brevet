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
import type { Hex } from "viem";

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

  const payment = await _getPendingPayment(paymentId);
  if (!payment) throw new Error("Pending payment not found");
  if (payment.userId !== auth.userId) throw new Error("Forbidden");
  if (payment.status !== "pending") throw new Error(`Payment is already ${payment.status}`);

  if (new Date() > payment.expiresAt) {
    await _expirePendingPayment(paymentId);
    throw new Error("Payment has expired");
  }

  const storedRequirements = JSON.parse(payment.paymentRequirements);
  const acceptedRequirement = Array.isArray(storedRequirements)
    ? storedRequirements[0]
    : storedRequirements;

  const paymentPayload = {
    x402Version: 1,
    resource: { url: payment.url, description: "", mimeType: "" },
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
  };

  const paymentHeaders = buildPaymentHeaders(paymentPayload);

  // Include stored request headers and body in the paid fetch
  const storedHeaders: Record<string, string> = payment.requestHeaders
    ? JSON.parse(payment.requestHeaders)
    : {};

  const paidResponse = await fetch(payment.url, {
    method: payment.method,
    headers: {
      ...storedHeaders,
      ...paymentHeaders,
    },
    ...(payment.requestBody ? { body: payment.requestBody } : {}),
  });

  // Mark as approved with signature first (transitional state)
  await _approvePendingPayment(paymentId, signature);

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
    amount: payment.amount,
    endpoint: payment.url,
    network: acceptedRequirement.network ?? "base",
    status: txStatus,
    userId: payment.userId,
    txHash: txHash ?? undefined,
    responsePayload,
  });

  // Store response on the PendingPayment record
  if (paidResponse.ok) {
    await completePendingPayment(paymentId, {
      responsePayload: responsePayload ?? "",
      responseStatus: paidResponse.status,
      txHash: txHash ?? undefined,
    });
  } else {
    await failPendingPayment(paymentId, {
      responsePayload: responsePayload ?? undefined,
      responseStatus: paidResponse.status,
    });
  }

  // Parse response data for the return value
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

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/pending");
  revalidatePath("/dashboard/transactions");

  return {
    success: paidResponse.ok,
    status: paidResponse.status,
    data: responseData,
  };
}

export async function rejectPendingPayment(paymentId: string) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const payment = await _getPendingPayment(paymentId);
  if (!payment) throw new Error("Pending payment not found");
  if (payment.userId !== auth.userId) throw new Error("Forbidden");
  if (payment.status !== "pending") throw new Error(`Payment is already ${payment.status}`);

  await _rejectPendingPayment(paymentId);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/pending");

  return { success: true, status: "rejected" };
}
