import type { Hex } from "viem";
import type { PaymentRequirement } from "@/lib/x402/types";
import {
  USDC_DOMAIN,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  buildTransferAuthorization,
} from "@/lib/x402/eip712";

/**
 * A signing request to be fulfilled client-side via Wagmi's `useSignTypedData`.
 *
 * The server builds this object with the EIP-712 typed data, and the client
 * presents it to the user's WalletConnect wallet for approval.
 */
export interface WalletConnectSigningRequest {
  /** EIP-712 domain for USDC on Base. */
  domain: typeof USDC_DOMAIN;
  /** EIP-712 type definitions for TransferWithAuthorization. */
  types: typeof TRANSFER_WITH_AUTHORIZATION_TYPES;
  /** The primary type being signed. */
  primaryType: "TransferWithAuthorization";
  /** The message values to sign. */
  message: {
    from: Hex;
    to: Hex;
    value: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: Hex;
  };
}

/**
 * Build a WalletConnect signing request from a payment requirement.
 *
 * This creates the full EIP-712 typed data that the client should pass
 * to Wagmi's `useSignTypedData` hook for the user to approve.
 *
 * @param requirement  The payment requirement from the 402 response
 * @param userAddress  The user's connected wallet address (payer)
 */
export function createSigningRequest(
  requirement: PaymentRequirement,
  userAddress: Hex,
): WalletConnectSigningRequest {
  const amountWei = BigInt(requirement.maxAmountRequired);
  const authorization = buildTransferAuthorization(
    userAddress,
    requirement.payTo,
    amountWei,
  );

  return {
    domain: USDC_DOMAIN,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: authorization.from,
      to: authorization.to,
      value: authorization.value,
      validAfter: authorization.validAfter,
      validBefore: authorization.validBefore,
      nonce: authorization.nonce,
    },
  };
}
