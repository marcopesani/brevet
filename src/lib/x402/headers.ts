import { x402HTTPClient, x402Client } from "@x402/core/client";
import type { PaymentRequired, PaymentPayload } from "@x402/core/types";
import type { SettleResponse } from "@x402/core/types";

/**
 * Lazily-created x402HTTPClient used only for response parsing.
 * No schemes registered — this is purely for header encode/decode.
 */
let _parsingClient: x402HTTPClient | null = null;
function getParsingClient(): x402HTTPClient {
  if (!_parsingClient) {
    _parsingClient = new x402HTTPClient(new x402Client());
  }
  return _parsingClient;
}

/**
 * Parse the payment requirements from a 402 response.
 *
 * Handles both V1 (body-based) and V2 (Payment-Required header, base64).
 * Uses @x402/core's x402HTTPClient which transparently supports both versions.
 */
export function parsePaymentRequired(
  response: Response,
  body?: unknown,
): PaymentRequired | null {
  try {
    const getHeader = (name: string) => response.headers.get(name);
    return getParsingClient().getPaymentRequiredResponse(getHeader, body);
  } catch {
    return null;
  }
}

/**
 * Build HTTP headers containing the encoded payment signature.
 *
 * Uses @x402/core's x402HTTPClient to properly encode the payment payload
 * into the correct header format (V1: X-PAYMENT, V2: Payment-Signature base64).
 */
export function buildPaymentHeaders(
  paymentPayload: PaymentPayload,
): Record<string, string> {
  return getParsingClient().encodePaymentSignatureHeader(paymentPayload);
}

/**
 * Extract payment settlement response from HTTP headers.
 *
 * Parses the Payment-Response header (V2) or X-PAYMENT-RESPONSE (V1)
 * from a successful response after payment settlement.
 */
export function extractSettleResponse(
  response: Response,
): SettleResponse | null {
  try {
    const getHeader = (name: string) => response.headers.get(name);
    return getParsingClient().getPaymentSettleResponse(getHeader);
  } catch {
    return null;
  }
}

