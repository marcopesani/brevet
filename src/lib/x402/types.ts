/**
 * Re-export canonical types from @x402/core and define our app-specific types.
 *
 * SDK types replace our hand-rolled definitions for protocol-level concerns.
 * App-specific types (SigningStrategy, PaymentResult) remain ours.
 */
export type {
  PaymentRequired,
  PaymentRequirements,
  PaymentPayload,
  Network,
  SettleResponse,
} from "@x402/core/types";

export type {
  PaymentRequirementsV1,
  PaymentRequiredV1,
  PaymentPayloadV1,
} from "@x402/core/types";

export type {
  ExactEIP3009Payload,
  ExactPermit2Payload,
  ExactEvmPayloadV2,
  ClientEvmSigner,
} from "@x402/evm";

/** Determines which signing method to use based on amount vs policy limits. */
export type SigningStrategy = "auto_sign" | "manual_approval" | "rejected";

/** Result of processing an x402 payment — discriminated union on `status`. */
export type PaymentResult =
  | {
      success: true;
      status: "completed";
      signingStrategy: SigningStrategy;
      response?: Response;
      chainId?: number;
      /** Settlement data from the Payment-Response header (V2) or X-Payment-Response (V1). */
      settlement?: import("@x402/core/types").SettleResponse;
      error?: undefined;
      paymentRequirements?: undefined;
      amountRaw?: undefined;
      asset?: undefined;
      maxTimeoutSeconds?: undefined;
    }
  | {
      success: false;
      status: "pending_approval";
      signingStrategy: "manual_approval";
      /** JSON-encoded payment requirements for client-side signing. */
      paymentRequirements: string;
      /** Raw token amount from the selected requirement. */
      amountRaw?: string;
      /** Asset contract address from the selected requirement. */
      asset?: string;
      /** The chain ID selected for this payment. */
      chainId?: number;
      /** Protocol-defined validity window in seconds. */
      maxTimeoutSeconds: number;
      error?: undefined;
      response?: undefined;
      settlement?: undefined;
    }
  | {
      success: false;
      status: "rejected";
      signingStrategy: SigningStrategy;
      error: string;
      chainId?: undefined;
      response?: Response;
      settlement?: undefined;
      paymentRequirements?: undefined;
      amountRaw?: undefined;
      asset?: undefined;
      maxTimeoutSeconds?: undefined;
    };
