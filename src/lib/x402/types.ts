import type { Hex } from "viem";

/** A single payment requirement from a 402 response. */
export interface PaymentRequirement {
  scheme: "exact";
  network: "eip155:8453";
  maxAmountRequired: string; // stringified wei amount
  resource: string; // the URL being paid for
  description?: string;
  mimeType?: string;
  payTo: Hex; // recipient address
  requiredDeadlineSeconds?: number;
  extra?: Record<string, unknown>;
}

/** The parsed PAYMENT-REQUIRED / X-PAYMENT header value. */
export type PaymentRequirements = PaymentRequirement[];

/** EIP-3009 TransferWithAuthorization parameters. */
export interface TransferAuthorization {
  from: Hex;
  to: Hex;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
}

/** The inner payload of a payment signature header. */
export interface PaymentPayload {
  signature: Hex;
  authorization: TransferAuthorization;
}

/** The complete payment response header value (before base64 encoding). */
export interface PaymentHeader {
  x402Version: 1;
  scheme: "exact";
  network: "eip155:8453";
  payload: PaymentPayload;
}

/** Result of processing an x402 payment. */
export interface PaymentResult {
  success: boolean;
  response?: Response;
  error?: string;
}
