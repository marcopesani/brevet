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
} from "@/lib/data/payments";
import { createTransaction } from "@/lib/data/transactions";
import { buildPaymentHeaders } from "@/lib/x402/headers";
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

  const paidResponse = await fetch(payment.url, {
    method: payment.method,
    headers: paymentHeaders,
  });

  const txStatus = paidResponse.ok ? "completed" : "failed";

  await createTransaction({
    amount: payment.amount,
    endpoint: payment.url,
    network: acceptedRequirement.network ?? "base",
    status: txStatus,
    userId: payment.userId,
  });

  await _approvePendingPayment(paymentId, signature);

  let responseData: unknown = null;
  const contentType = paidResponse.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    responseData = await paidResponse.json();
  } else {
    responseData = await paidResponse.text();
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
