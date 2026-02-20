/**
 * Client-safe session key policy helpers. No process.env — safe to import from "use client" components.
 * For server-only session key limits (SESSION_KEY_MAX_*), use @/lib/smart-account-constants.
 */
import {
  toCallPolicy,
  CallPolicyVersion,
  toTimestampPolicy,
} from "@zerodev/permissions/policies";
import { entryPoint07Address } from "viem/account-abstraction";
import { parseAbi, type Address } from "viem";

export const ENTRY_POINT = {
  address: entryPoint07Address,
  version: "0.7" as const,
};

export const KERNEL_VERSION = "0.3.3" as const;

const USDC_TRANSFER_ABI = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature) external",
  "function transfer(address to, uint256 amount) external returns (bool)",
]);

export function buildSessionKeyPolicies(
  usdcAddress: Address,
  expiryTimestamp: number,
) {
  return [
    toCallPolicy({
      policyVersion: CallPolicyVersion.V0_0_4,
      permissions: [
        {
          target: usdcAddress,
          abi: USDC_TRANSFER_ABI,
          functionName: "transferWithAuthorization",
        },
        {
          target: usdcAddress,
          abi: USDC_TRANSFER_ABI,
          functionName: "transfer",
        },
      ],
    }),
    toTimestampPolicy({
      validUntil: expiryTimestamp,
    }),
  ];
}
