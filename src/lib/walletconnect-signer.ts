import type { Hex } from "viem";
import type { PaymentRequirements } from "@x402/core/types";
import { authorizationTypes } from "@x402/evm";
import crypto from "crypto";
import { chainConfig } from "@/lib/chain-config";

/**
 * A signing request to be fulfilled client-side via Wagmi's `useSignTypedData`.
 *
 * The server builds this object with the EIP-712 typed data, and the client
 * presents it to the user's WalletConnect wallet for approval.
 */
export interface WalletConnectSigningRequest {
  /** EIP-712 domain for USDC on the configured chain. */
  domain: typeof chainConfig.usdcDomain;
  /** EIP-712 type definitions for TransferWithAuthorization. */
  types: typeof authorizationTypes;
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
 * Build a WalletConnect signing request from SDK payment requirements.
 *
 * This creates the full EIP-712 typed data that the client should pass
 * to Wagmi's `useSignTypedData` hook for the user to approve.
 *
 * @param requirement  The payment requirements from the 402 response (SDK type)
 * @param userAddress  The user's connected wallet address (payer)
 */
export function createSigningRequest(
  requirement: PaymentRequirements,
  userAddress: Hex,
): WalletConnectSigningRequest {
  const amountWei = BigInt(requirement.amount);
  const nonce = `0x${crypto.randomBytes(32).toString("hex")}` as Hex;
  const now = BigInt(Math.floor(Date.now() / 1_000));

  return {
    domain: chainConfig.usdcDomain,
    types: authorizationTypes,
    primaryType: "TransferWithAuthorization",
    message: {
      from: userAddress,
      to: requirement.payTo as Hex,
      value: amountWei,
      validAfter: BigInt(0),
      validBefore: now + BigInt(300),
      nonce,
    },
  };
}
