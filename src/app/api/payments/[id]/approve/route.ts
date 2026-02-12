import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { buildPaymentSignatureHeader } from "@/lib/x402/headers";
import type { PaymentRequirement, TransferAuthorization } from "@/lib/x402/types";
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

  // Build the transfer authorization for the payment header
  const transferAuth: TransferAuthorization = {
    from: authorization.from as Hex,
    to: authorization.to as Hex,
    value: BigInt(authorization.value),
    validAfter: BigInt(authorization.validAfter),
    validBefore: BigInt(authorization.validBefore),
    nonce: authorization.nonce as Hex,
  };

  // Build the payment header and make the paid request
  const paymentHeader = buildPaymentSignatureHeader(
    signature as Hex,
    transferAuth,
  );

  const paidResponse = await fetch(payment.url, {
    method: payment.method,
    headers: {
      "PAYMENT-SIGNATURE": paymentHeader,
    },
  });

  const txStatus = paidResponse.ok ? "completed" : "failed";

  // Log transaction
  await prisma.transaction.create({
    data: {
      amount: payment.amount,
      endpoint: payment.url,
      network: "base",
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
