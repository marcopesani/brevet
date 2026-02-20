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

/** Result of processing an x402 payment. */
export interface PaymentResult {
  success: boolean;
  status: "completed" | "pending_approval" | "rejected";
  signingStrategy: SigningStrategy;
  response?: Response;
  error?: string;
  /** Included when status is "pending_approval" — JSON-encoded payment requirements for client-side signing. */
  paymentRequirements?: string;
  /** Amount in USD for the pending payment. */
  amount?: number;
  /** The chain ID selected for this payment (included when status is "pending_approval" or "completed"). */
  chainId?: number;
  /** Settlement data from the Payment-Response header (V2) or X-Payment-Response (V1). */
  settlement?: import("@x402/core/types").SettleResponse;
}
