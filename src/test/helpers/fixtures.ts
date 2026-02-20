import mongoose from "mongoose";
import {
  TEST_WALLET_ADDRESS,
  TEST_ENCRYPTED_PRIVATE_KEY,
} from "./crypto";

/** Deterministic ObjectId for the default test user. */
export const TEST_USER_ID = new mongoose.Types.ObjectId().toString();

/**
 * Create test user data with sensible defaults.
 * Uses ObjectId strings to match MongoDB schema.
 */
export function createTestUser(overrides?: {
  id?: string;
  email?: string;
  walletAddress?: string;
}) {
  return {
    _id: overrides?.id
      ? new mongoose.Types.ObjectId(overrides.id)
      : new mongoose.Types.ObjectId(TEST_USER_ID),
    email: overrides?.email ?? "test@example.com",
    walletAddress: overrides?.walletAddress ?? TEST_WALLET_ADDRESS,
  };
}

const DEFAULT_CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || "8453",
  10,
);

/**
 * Create test hot wallet data for a given user.
 */
export function createTestHotWallet(
  userId: string,
  overrides?: {
    id?: string;
    address?: string;
    encryptedPrivateKey?: string;
    chainId?: number;
  },
) {
  return {
    _id: overrides?.id
      ? new mongoose.Types.ObjectId(overrides.id)
      : new mongoose.Types.ObjectId(),
    address: overrides?.address ?? TEST_WALLET_ADDRESS,
    encryptedPrivateKey:
      overrides?.encryptedPrivateKey ?? TEST_ENCRYPTED_PRIVATE_KEY,
    userId: new mongoose.Types.ObjectId(userId),
    chainId: overrides?.chainId ?? DEFAULT_CHAIN_ID,
  };
}

/** Test smart account address (deterministic, derived from test wallet). */
const TEST_SMART_ACCOUNT_ADDRESS = "0x" + "cc".repeat(20);

/** Test session key address. */
const TEST_SESSION_KEY_ADDRESS = "0x" + "dd".repeat(20);

/**
 * Create test smart account data for a given user.
 */
export function createTestSmartAccount(
  userId: string,
  overrides?: {
    id?: string;
    ownerAddress?: string;
    smartAccountAddress?: string;
    sessionKeyAddress?: string;
    sessionKeyEncrypted?: string;
    sessionKeyStatus?: "pending_grant" | "active" | "expired" | "revoked";
    serializedAccount?: string;
    chainId?: number;
  },
) {
  return {
    _id: overrides?.id
      ? new mongoose.Types.ObjectId(overrides.id)
      : new mongoose.Types.ObjectId(),
    ownerAddress: overrides?.ownerAddress ?? TEST_WALLET_ADDRESS,
    smartAccountAddress: overrides?.smartAccountAddress ?? TEST_SMART_ACCOUNT_ADDRESS,
    sessionKeyAddress: overrides?.sessionKeyAddress ?? TEST_SESSION_KEY_ADDRESS,
    sessionKeyEncrypted:
      overrides?.sessionKeyEncrypted ?? TEST_ENCRYPTED_PRIVATE_KEY,
    sessionKeyStatus: overrides?.sessionKeyStatus ?? "active",
    serializedAccount: overrides?.serializedAccount,
    userId: new mongoose.Types.ObjectId(userId),
    chainId: overrides?.chainId ?? DEFAULT_CHAIN_ID,
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
    autoSign?: boolean;
    status?: string;
    chainId?: number;
  },
) {
  return {
    _id: overrides?.id
      ? new mongoose.Types.ObjectId(overrides.id)
      : new mongoose.Types.ObjectId(),
    endpointPattern: overrides?.endpointPattern ?? "https://api.example.com",
    autoSign: overrides?.autoSign ?? true,
    status: overrides?.status ?? "active",
    userId: new mongoose.Types.ObjectId(userId),
    ...(overrides?.chainId !== undefined && { chainId: overrides.chainId }),
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
    chainId?: number;
    status?: string;
    type?: string;
  },
) {
  return {
    _id: overrides?.id
      ? new mongoose.Types.ObjectId(overrides.id)
      : new mongoose.Types.ObjectId(),
    amount: overrides?.amount ?? 0.05,
    endpoint: overrides?.endpoint ?? "https://api.example.com/resource",
    txHash: overrides?.txHash ?? "0x" + "a".repeat(64),
    network: overrides?.network ?? "base-sepolia",
    status: overrides?.status ?? "completed",
    type: overrides?.type ?? "payment",
    userId: new mongoose.Types.ObjectId(userId),
    ...(overrides?.chainId !== undefined && { chainId: overrides.chainId }),
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
    _id: overrides?.id
      ? new mongoose.Types.ObjectId(overrides.id)
      : new mongoose.Types.ObjectId(),
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
    userId: new mongoose.Types.ObjectId(userId),
  };
}
