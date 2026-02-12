import type {
  PaymentRequirements,
  PaymentHeader,
  TransferAuthorization,
} from "./types";
import type { Hex } from "viem";
import { chainConfig } from "@/lib/chain-config";

/**
 * Extract a transaction hash from a facilitator's response.
 *
 * Checks (in order):
 * 1. `X-PAYMENT-TX-HASH` response header
 * 2. JSON body `txHash` field (if content-type is JSON)
 *
 * Returns null if no hash is found.
 */
export async function extractTxHashFromResponse(
  response: Response,
): Promise<string | null> {
  // Try header first
  const headerHash = response.headers.get("X-PAYMENT-TX-HASH");
  if (headerHash && headerHash.startsWith("0x")) {
    return headerHash;
  }

  // Try JSON body — clone so the caller can still read the response
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const cloned = response.clone();
      const body = await cloned.json();
      if (typeof body?.txHash === "string" && body.txHash.startsWith("0x")) {
        return body.txHash;
      }
    } catch {
      // Body isn't valid JSON or can't be read — ignore
    }
  }

  return null;
}

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
    network: chainConfig.networkString,
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
