import { type Hex, type TypedDataDomain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import crypto from "crypto";
import type { TransferAuthorization } from "./types";
import { chainConfig } from "@/lib/chain-config";

/** USDC EIP-3009 domain separator — sourced from chain config. */
export const USDC_DOMAIN: TypedDataDomain = chainConfig.usdcDomain;

/** EIP-712 type definition for TransferWithAuthorization. */
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/**
 * Build TransferWithAuthorization parameters.
 *
 * @param from   The hot wallet address (payer)
 * @param to     The payTo address from the 402 response
 * @param value  Amount in USDC wei (6 decimals)
 */
export function buildTransferAuthorization(
  from: Hex,
  to: Hex,
  value: bigint,
): TransferAuthorization {
  const nonce = `0x${crypto.randomBytes(32).toString("hex")}` as Hex;
  const now = BigInt(Math.floor(Date.now() / 1_000));

  return {
    from,
    to,
    value,
    validAfter: BigInt(0),
    validBefore: now + BigInt(300), // 5 minute validity window
    nonce,
  };
}

/**
 * Sign a TransferWithAuthorization message with a private key.
 *
 * @returns The EIP-712 signature as a hex string
 */
export async function signTransferAuthorization(
  authorization: TransferAuthorization,
  privateKey: Hex,
): Promise<Hex> {
  const account = privateKeyToAccount(privateKey);
  const signature = await account.signTypedData({
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
  });
  return signature;
}
