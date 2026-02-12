import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  encryptPrivateKey,
  decryptPrivateKey,
  createHotWallet,
  withdrawFromHotWallet,
  getUsdcBalance,
  USDC_ADDRESS,
  USDC_DECIMALS,
} from "../hot-wallet";
import {
  TEST_PRIVATE_KEY,
  TEST_WALLET_ADDRESS,
  TEST_ENCRYPTED_PRIVATE_KEY,
} from "../../test/helpers/crypto";
import { resetTestDb, seedTestUser, cleanupTestDb } from "../../test/helpers/db";
import { prisma } from "../db";

// Mock viem to avoid real RPC calls
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: vi.fn(),
    })),
    createWalletClient: vi.fn(() => ({
      writeContract: vi.fn(),
    })),
  };
});

describe("hot-wallet", () => {
  describe("encryptPrivateKey / decryptPrivateKey", () => {
    it("should encrypt and decrypt a private key roundtrip", () => {
      const originalKey = TEST_PRIVATE_KEY;
      const encrypted = encryptPrivateKey(originalKey);
      const decrypted = decryptPrivateKey(encrypted);
      expect(decrypted).toBe(originalKey);
    });

    it("should produce different ciphertext each time (random IV)", () => {
      const encrypted1 = encryptPrivateKey(TEST_PRIVATE_KEY);
      const encrypted2 = encryptPrivateKey(TEST_PRIVATE_KEY);
      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should produce the format iv:authTag:encrypted (hex)", () => {
      const encrypted = encryptPrivateKey(TEST_PRIVATE_KEY);
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
      // IV is 12 bytes = 24 hex chars
      expect(parts[0]).toMatch(/^[0-9a-f]{24}$/);
      // Auth tag is 16 bytes = 32 hex chars
      expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
      // Encrypted data is hex
      expect(parts[2]).toMatch(/^[0-9a-f]+$/);
    });

    it("should fail to decrypt with a wrong encryption key", () => {
      const encrypted = encryptPrivateKey(TEST_PRIVATE_KEY);
      // Temporarily change the encryption key
      const originalKey = process.env.HOT_WALLET_ENCRYPTION_KEY;
      process.env.HOT_WALLET_ENCRYPTION_KEY =
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      expect(() => decryptPrivateKey(encrypted)).toThrow();
      process.env.HOT_WALLET_ENCRYPTION_KEY = originalKey;
    });

    it("should throw if HOT_WALLET_ENCRYPTION_KEY is not set", () => {
      const originalKey = process.env.HOT_WALLET_ENCRYPTION_KEY;
      delete process.env.HOT_WALLET_ENCRYPTION_KEY;
      expect(() => encryptPrivateKey("some-key")).toThrow(
        "HOT_WALLET_ENCRYPTION_KEY is not set",
      );
      process.env.HOT_WALLET_ENCRYPTION_KEY = originalKey;
    });
  });

  describe("createHotWallet", () => {
    it("should return a valid Ethereum address", () => {
      const wallet = createHotWallet();
      expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it("should return an encrypted private key", () => {
      const wallet = createHotWallet();
      expect(wallet.encryptedPrivateKey).toBeDefined();
      // Should be in iv:authTag:encrypted format
      const parts = wallet.encryptedPrivateKey.split(":");
      expect(parts).toHaveLength(3);
    });

    it("should decrypt to a key that derives the same address", () => {
      const wallet = createHotWallet();
      const decryptedKey = decryptPrivateKey(wallet.encryptedPrivateKey);
      // Import dynamically to get the real function (not mocked)
      const { privateKeyToAccount } = require("viem/accounts");
      const account = privateKeyToAccount(decryptedKey as `0x${string}`);
      expect(account.address).toBe(wallet.address);
    });

    it("should generate different wallets each time", () => {
      const wallet1 = createHotWallet();
      const wallet2 = createHotWallet();
      expect(wallet1.address).not.toBe(wallet2.address);
    });
  });

  describe("withdrawFromHotWallet", () => {
    beforeEach(async () => {
      await resetTestDb();
    });

    afterEach(async () => {
      vi.restoreAllMocks();
    });

    it("should throw for an invalid destination address", async () => {
      await expect(
        withdrawFromHotWallet("test-user-1", 1.0, "not-an-address"),
      ).rejects.toThrow("Invalid destination address");
    });

    it("should throw for zero or negative amount", async () => {
      const validAddress = "0x" + "1".repeat(40);
      await expect(
        withdrawFromHotWallet("test-user-1", 0, validAddress),
      ).rejects.toThrow("Amount must be greater than 0");

      await expect(
        withdrawFromHotWallet("test-user-1", -5, validAddress),
      ).rejects.toThrow("Amount must be greater than 0");
    });

    it("should throw if user has no hot wallet", async () => {
      // Create a user without a hot wallet
      await prisma.user.create({
        data: { id: "no-wallet-user", walletAddress: TEST_WALLET_ADDRESS },
      });

      const validAddress = "0x" + "1".repeat(40);
      await expect(
        withdrawFromHotWallet("no-wallet-user", 1.0, validAddress),
      ).rejects.toThrow("No hot wallet found for this user");
    });

    it("should throw if insufficient balance", async () => {
      const { user } = await seedTestUser();

      // Mock getUsdcBalance via the public client readContract
      const { createPublicClient } = await import("viem");
      const mockReadContract = vi.fn().mockResolvedValue(BigInt(500000)); // 0.5 USDC
      vi.mocked(createPublicClient).mockReturnValue({
        readContract: mockReadContract,
      } as any);

      const validAddress = "0x" + "1".repeat(40);
      await expect(
        withdrawFromHotWallet(user.id, 1.0, validAddress),
      ).rejects.toThrow(/Insufficient balance/);
    });

    it("should submit transfer and log transaction on success", async () => {
      const { user } = await seedTestUser();

      const mockTxHash = "0x" + "f".repeat(64);

      // Mock public client for balance check
      const { createPublicClient, createWalletClient } = await import("viem");
      const mockReadContract = vi
        .fn()
        .mockResolvedValue(BigInt(10_000_000)); // 10 USDC
      vi.mocked(createPublicClient).mockReturnValue({
        readContract: mockReadContract,
      } as any);

      // Mock wallet client for transfer
      const mockWriteContract = vi.fn().mockResolvedValue(mockTxHash);
      vi.mocked(createWalletClient).mockReturnValue({
        writeContract: mockWriteContract,
      } as any);

      const toAddress = "0x" + "2".repeat(40);
      const result = await withdrawFromHotWallet(user.id, 1.0, toAddress);

      expect(result.txHash).toBe(mockTxHash);

      // Verify writeContract was called with correct args
      expect(mockWriteContract).toHaveBeenCalledOnce();
      const callArgs = mockWriteContract.mock.calls[0][0];
      expect(callArgs.address).toBe(USDC_ADDRESS);
      expect(callArgs.functionName).toBe("transfer");
      expect(callArgs.args[0]).toBe(toAddress);

      // Verify transaction was logged in the database
      const tx = await prisma.transaction.findFirst({
        where: { userId: user.id, type: "withdrawal" },
      });
      expect(tx).not.toBeNull();
      expect(tx!.txHash).toBe(mockTxHash);
      expect(tx!.amount).toBe(1.0);
      expect(tx!.endpoint).toBe(`withdrawal:${toAddress}`);
      expect(tx!.status).toBe("completed");
    });
  });
});
