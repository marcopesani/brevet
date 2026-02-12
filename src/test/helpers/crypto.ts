import crypto from "crypto";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

/**
 * A known private key for testing. NEVER use on mainnet.
 * This is a deterministic key derived from a test seed.
 */
export const TEST_PRIVATE_KEY: Hex =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

/**
 * The wallet address derived from TEST_PRIVATE_KEY.
 */
export const TEST_WALLET_ADDRESS =
  privateKeyToAccount(TEST_PRIVATE_KEY).address;

/**
 * The test encryption key (64-char hex = 32 bytes) matching the one set in setup.ts.
 */
const TEST_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * Encrypt a private key using the test encryption key (AES-256-GCM).
 * Matches the format used by src/lib/hot-wallet.ts: iv:authTag:encrypted (hex).
 */
export function encryptTestPrivateKey(privateKey: string): string {
  const key = Buffer.from(TEST_ENCRYPTION_KEY, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Pre-encrypted version of TEST_PRIVATE_KEY for use in fixtures.
 */
export const TEST_ENCRYPTED_PRIVATE_KEY = encryptTestPrivateKey(
  TEST_PRIVATE_KEY,
);
