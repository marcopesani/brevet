/**
 * EVM signer utilities for x402 payments.
 *
 * Uses @x402/evm's ExactEvmScheme which handles both EIP-3009 (USDC gasless)
 * and Permit2 (any ERC-20) signing. We provide a thin adapter to create
 * SDK-compatible signers from viem private keys.
 */
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ExactEvmScheme } from "@x402/evm";
import type { ClientEvmSigner } from "@x402/evm";

/**
 * Create an SDK-compatible ClientEvmSigner from a viem private key.
 *
 * viem's `privateKeyToAccount()` already satisfies the ClientEvmSigner
 * interface (has `address` and `signTypedData`).
 */
export function createEvmSigner(privateKey: Hex): ClientEvmSigner {
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    signTypedData: (args) =>
      account.signTypedData({
        domain: args.domain as Parameters<typeof account.signTypedData>[0]["domain"],
        types: args.types as Parameters<typeof account.signTypedData>[0]["types"],
        primaryType: args.primaryType as string,
        message: args.message as Parameters<typeof account.signTypedData>[0]["message"],
      }),
  };
}

/**
 * Create an ExactEvmScheme instance from a viem private key.
 *
 * The scheme handles both EIP-3009 (USDC) and Permit2 (generic ERC-20)
 * based on the `extra.assetTransferMethod` in payment requirements.
 */
export function createExactEvmScheme(privateKey: Hex): ExactEvmScheme {
  return new ExactEvmScheme(createEvmSigner(privateKey));
}

// Re-export SDK types for convenience
export { ExactEvmScheme };
export { authorizationTypes } from "@x402/evm";

// Re-export smart account signer functions
export {
  createSmartAccountSigner,
  createSmartAccountSignerFromSerialized,
} from "@/lib/smart-account";
