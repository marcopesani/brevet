import type {
  PaymentRequirements,
  PaymentHeader,
  TransferAuthorization,
} from "./types";
import type { Hex } from "viem";

/**
 * Parse the payment requirements from a 402 response.
 *
 * Checks both `X-PAYMENT` and `PAYMENT-REQUIRED` headers.
 * The header value is a JSON-encoded PaymentRequirements array.
 */
export function parsePaymentRequired(
  response: Response,
): PaymentRequirements | null {
  const raw =
    response.headers.get("X-PAYMENT") ??
    response.headers.get("PAYMENT-REQUIRED");

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    // Normalise: accept both a single object and an array
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return null;
  }
}

/**
 * Build the PAYMENT-SIGNATURE header value.
 *
 * Format: base64-encoded JSON containing x402Version, scheme, network,
 * and payload (signature + authorization).
 */
export function buildPaymentSignatureHeader(
  signature: Hex,
  authorization: TransferAuthorization,
): string {
  const header: PaymentHeader = {
    x402Version: 1,
    scheme: "exact",
    network: "eip155:8453",
    payload: {
      signature,
      authorization: {
        ...authorization,
        // Serialise bigints as strings for JSON
        value: authorization.value,
        validAfter: authorization.validAfter,
        validBefore: authorization.validBefore,
      },
    },
  };

  // Custom replacer to convert BigInt to string for JSON serialisation
  const json = JSON.stringify(header, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );

  return btoa(json);
}
