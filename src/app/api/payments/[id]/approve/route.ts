import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { buildPaymentHeaders } from "@/lib/x402/headers";
import { getAuthenticatedUser } from "@/lib/auth";
import type { Hex } from "viem";

/**
 * POST /api/payments/[id]/approve
 * Receive the EIP-712 signature from the client, complete the x402 payment flow.
 * Body: { signature, authorization }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(getClientIp(request), 10);
  if (limited) return limited;

  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = auth;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { signature, authorization } = body as {
    signature?: string;
    authorization?: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };

  if (!signature || !authorization) {
    return NextResponse.json(
      { error: "signature and authorization are required" },
      { status: 400 },
    );
  }

  // Find the pending payment
  const payment = await prisma.pendingPayment.findUnique({
    where: { id },
  });

  if (!payment) {
    return NextResponse.json(
      { error: "Pending payment not found" },
      { status: 404 },
    );
  }

  // Verify the authenticated user owns this payment
  if (payment.userId !== userId) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  if (payment.status !== "pending") {
    return NextResponse.json(
      { error: `Payment is already ${payment.status}` },
      { status: 409 },
    );
  }

  if (new Date() > payment.expiresAt) {
    // Mark as expired
    await prisma.pendingPayment.update({
      where: { id },
      data: { status: "expired" },
    });
    return NextResponse.json(
      { error: "Payment has expired" },
      { status: 410 },
    );
  }

  // Build an SDK-compatible PaymentPayload from the WalletConnect signature
  // Parse the stored payment requirements to get the accepted requirement
  const storedRequirements = JSON.parse(payment.paymentRequirements);
  const acceptedRequirement = Array.isArray(storedRequirements)
    ? storedRequirements[0]
    : storedRequirements;

  const paymentPayload = {
    x402Version: 1,
    resource: {
      url: payment.url,
      description: "",
      mimeType: "",
    },
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

  // Build the payment headers and make the paid request
  const paymentHeaders = buildPaymentHeaders(paymentPayload);

  const paidResponse = await fetch(payment.url, {
    method: payment.method,
    headers: paymentHeaders,
  });

  const txStatus = paidResponse.ok ? "completed" : "failed";

  // Log transaction
  await prisma.transaction.create({
    data: {
      amount: payment.amount,
      endpoint: payment.url,
      network: acceptedRequirement.network ?? "base",
      status: txStatus,
      userId: payment.userId,
    },
  });

  // Update pending payment status
  await prisma.pendingPayment.update({
    where: { id },
    data: {
      status: "approved",
      signature,
    },
  });

  // Read response body for the caller
  let responseData: unknown = null;
  const contentType = paidResponse.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    responseData = await paidResponse.json();
  } else {
    responseData = await paidResponse.text();
  }

  return NextResponse.json({
    success: paidResponse.ok,
    status: paidResponse.status,
    data: responseData,
  });
}
