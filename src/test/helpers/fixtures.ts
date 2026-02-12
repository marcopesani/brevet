import {
  TEST_WALLET_ADDRESS,
  TEST_ENCRYPTED_PRIVATE_KEY,
} from "./crypto";

/** Deterministic UUID for the default test user. */
export const TEST_USER_ID = "00000000-0000-4000-a000-000000000001";

/**
 * Create test user data with sensible defaults.
 * Uses UUID IDs to match Supabase Auth / Postgres schema.
 */
export function createTestUser(overrides?: {
  id?: string;
  email?: string;
  walletAddress?: string;
}) {
  return {
    id: overrides?.id ?? TEST_USER_ID,
    email: overrides?.email ?? "test@example.com",
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
    id: overrides?.id ?? "00000000-0000-4000-a000-000000000010",
    address: overrides?.address ?? TEST_WALLET_ADDRESS,
    encryptedPrivateKey:
      overrides?.encryptedPrivateKey ?? TEST_ENCRYPTED_PRIVATE_KEY,
    userId,
  };
}

/**
 * Create test endpoint policy data for a given user.
 */
export function createTestEndpointPolicy(
  userId: string,
  overrides?: {
    id?: string;
    endpointPattern?: string;
    payFromHotWallet?: boolean;
    status?: string;
  },
) {
  return {
    id: overrides?.id ?? "00000000-0000-4000-a000-000000000020",
    endpointPattern: overrides?.endpointPattern ?? "https://api.example.com",
    payFromHotWallet: overrides?.payFromHotWallet ?? true,
    status: overrides?.status ?? "active",
    userId,
  };
}

/** @deprecated Use createTestEndpointPolicy instead. Alias for backwards compatibility. */
export const createTestPolicy = createTestEndpointPolicy;

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
    id: overrides?.id ?? "00000000-0000-4000-a000-000000000030",
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
    id: overrides?.id ?? "00000000-0000-4000-a000-000000000040",
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
