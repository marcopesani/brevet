import {
  toCallPolicy,
  CallPolicyVersion,
  toTimestampPolicy,
} from "@zerodev/permissions/policies";
import { entryPoint07Address } from "viem/account-abstraction";
import { parseAbi, type Address } from "viem";

// --- Session key policy defaults (from env vars) ---

function requireEnvInt(name: string): number {
  const raw = process.env[name];
  if (!raw) throw new Error(`Missing required env var: ${name}`);
  const val = parseInt(raw, 10);
  if (Number.isNaN(val) || val <= 0)
    throw new Error(
      `Invalid env var ${name}: must be a positive integer, got "${raw}"`,
    );
  return val;
}

export const SESSION_KEY_MAX_SPEND_PER_TX = requireEnvInt(
  "SESSION_KEY_MAX_SPEND_PER_TX",
);
export const SESSION_KEY_MAX_SPEND_DAILY = requireEnvInt(
  "SESSION_KEY_MAX_SPEND_DAILY",
);
export const SESSION_KEY_MAX_EXPIRY_DAYS = requireEnvInt(
  "SESSION_KEY_MAX_EXPIRY_DAYS",
);
export const SESSION_KEY_DEFAULT_EXPIRY_DAYS = requireEnvInt(
  "SESSION_KEY_DEFAULT_EXPIRY_DAYS",
);

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
