import {
  TEST_WALLET_ADDRESS,
  TEST_ENCRYPTED_PRIVATE_KEY,
} from "./crypto";

/**
 * Create test user data with sensible defaults.
 */
export function createTestUser(overrides?: {
  id?: string;
  walletAddress?: string;
}) {
  return {
    id: overrides?.id ?? "test-user-1",
    walletAddress: overrides?.walletAddress ?? TEST_WALLET_ADDRESS,
  };
}

/**
 * Create test hot wallet data for a given user.
 */
export function createTestHotWallet(
  userId: string,
  overrides?: {
    id?: string;
    address?: string;
    encryptedPrivateKey?: string;
  },
) {
  return {
    id: overrides?.id ?? "test-hw-1",
    address: overrides?.address ?? TEST_WALLET_ADDRESS,
    encryptedPrivateKey:
      overrides?.encryptedPrivateKey ?? TEST_ENCRYPTED_PRIVATE_KEY,
    userId,
  };
}

/**
 * Create test spending policy data for a given user.
 */
export function createTestPolicy(
  userId: string,
  overrides?: {
    id?: string;
    perRequestLimit?: number;
    perHourLimit?: number;
    perDayLimit?: number;
    wcApprovalLimit?: number;
    whitelistedEndpoints?: string;
    blacklistedEndpoints?: string;
  },
) {
  return {
    id: overrides?.id ?? "test-policy-1",
    perRequestLimit: overrides?.perRequestLimit ?? 0.1,
    perHourLimit: overrides?.perHourLimit ?? 1.0,
    perDayLimit: overrides?.perDayLimit ?? 10.0,
    wcApprovalLimit: overrides?.wcApprovalLimit ?? 5.0,
    whitelistedEndpoints: overrides?.whitelistedEndpoints ?? "[]",
    blacklistedEndpoints: overrides?.blacklistedEndpoints ?? "[]",
    userId,
  };
}

/**
 * Create test transaction data for a given user.
 */
export function createTestTransaction(
  userId: string,
  overrides?: {
    id?: string;
    amount?: number;
    endpoint?: string;
    txHash?: string | null;
    network?: string;
    status?: string;
    type?: string;
  },
) {
  return {
    id: overrides?.id ?? "test-tx-1",
    amount: overrides?.amount ?? 0.05,
    endpoint: overrides?.endpoint ?? "https://api.example.com/resource",
    txHash: overrides?.txHash ?? "0x" + "a".repeat(64),
    network: overrides?.network ?? "base-sepolia",
    status: overrides?.status ?? "completed",
    type: overrides?.type ?? "payment",
    userId,
  };
}

/**
 * Create test pending payment data for a given user.
 */
export function createTestPendingPayment(
  userId: string,
  overrides?: {
    id?: string;
    url?: string;
    method?: string;
    amount?: number;
    paymentRequirements?: string;
    status?: string;
    signature?: string | null;
    expiresAt?: Date;
  },
) {
  return {
    id: overrides?.id ?? "test-pp-1",
    url: overrides?.url ?? "https://api.example.com/paid-resource",
    method: overrides?.method ?? "GET",
    amount: overrides?.amount ?? 0.05,
    paymentRequirements:
      overrides?.paymentRequirements ??
      JSON.stringify([
        {
          scheme: "exact",
          network: "eip155:84532",
          maxAmountRequired: "50000",
          resource: "https://api.example.com/paid-resource",
          payTo: "0x" + "b".repeat(40),
          requiredDeadlineSeconds: 3600,
        },
      ]),
    status: overrides?.status ?? "pending",
    signature: overrides?.signature ?? null,
    expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 3600_000),
    userId,
  };
}
