/**
 * Client-safe session key policy helpers. No process.env — safe to import from "use client" components.
 * For server-only session key limits (SESSION_KEY_MAX_*), use @/lib/smart-account-constants.
 *
 * Policy design:
 * - Call policy uses NOT_FOR_VALIDATE_USEROP so it applies only during signature validation
 *   (EIP-1271 / signTypedData), not during UserOp validation. This lets the enable UserOp
 *   (which installs the permission module) succeed with a no-op calldata, while still
 *   restricting what the session key can sign to USDC calls only.
 * - Gas policy (enforcePaymaster) is omitted: the bundler's paymaster sponsorship is handled
 *   at the infrastructure level and must not block the enable UserOp from going through.
 */
import {
  toCallPolicy,
  CallPolicyVersion,
  toTimestampPolicy,
  ParamCondition,
} from "@zerodev/permissions/policies";
import { PolicyFlags } from "@zerodev/permissions";
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

/**
 * Build ZeroDev session key policies for USDC payments.
 *
 * @param usdcAddress - The USDC contract address for the target chain
 * @param expiryTimestamp - Unix timestamp when the session key expires
 * @param spendLimitPerTx - Optional per-transaction USDC spend limit in micro-units (6 decimals).
 *   When provided, both `transfer` and `transferWithAuthorization` are constrained so the
 *   amount/value argument must be ≤ this limit. Enforced on-chain by the call policy.
 */
export function buildSessionKeyPolicies(
  usdcAddress: Address,
  expiryTimestamp: number,
  spendLimitPerTx?: bigint,
) {
  return [
    toCallPolicy({
      policyVersion: CallPolicyVersion.V0_0_4,
      // Apply call policy only during signature validation (signTypedData / EIP-1271),
      // not during UserOp validation. This lets the enable UserOp (no-op calldata) pass
      // through while still restricting what the session key can sign.
      policyFlag: PolicyFlags.NOT_FOR_VALIDATE_USEROP,
      permissions: [
        {
          target: usdcAddress,
          abi: USDC_TRANSFER_ABI,
          functionName: "transferWithAuthorization",
          // args: [from, to, value, validAfter, validBefore, nonce, signature]
          ...(spendLimitPerTx !== undefined && {
            args: [
              null,
              null,
              { condition: ParamCondition.LESS_THAN_OR_EQUAL, value: spendLimitPerTx },
              null,
              null,
              null,
              null,
            ],
          }),
        },
        {
          target: usdcAddress,
          abi: USDC_TRANSFER_ABI,
          functionName: "transfer",
          // args: [to, amount]
          ...(spendLimitPerTx !== undefined && {
            args: [
              null,
              { condition: ParamCondition.LESS_THAN_OR_EQUAL, value: spendLimitPerTx },
            ],
          }),
        },
      ],
    }),
    toTimestampPolicy({
      validUntil: expiryTimestamp,
    }),
  ];
}
