import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  encryptPrivateKey,
  decryptPrivateKey,
  createHotWallet,
  withdrawFromHotWallet,
  USDC_ADDRESS,
} from "../hot-wallet";
import {
  TEST_PRIVATE_KEY,
} from "../../test/helpers/crypto";
import { resetTestDb, seedTestUser } from "../../test/helpers/db";
import { User } from "../models/user";
import { HotWallet as HotWalletModel } from "../models/hot-wallet";
import { Transaction } from "../models/transaction";
import mongoose from "mongoose";
import { createTestHotWallet } from "../../test/helpers/fixtures";

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

    it("should decrypt to a key that derives the same address", async () => {
      const wallet = createHotWallet();
      const decryptedKey = decryptPrivateKey(wallet.encryptedPrivateKey);
      // Import dynamically to get the real function (not mocked)
      const { privateKeyToAccount } = await import("viem/accounts");
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
      const userId = new mongoose.Types.ObjectId().toString();
      await expect(
        withdrawFromHotWallet(userId, 1.0, "not-an-address"),
      ).rejects.toThrow("Invalid destination address");
    });

    it("should throw for zero or negative amount", async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const validAddress = "0x" + "1".repeat(40);
      await expect(
        withdrawFromHotWallet(userId, 0, validAddress),
      ).rejects.toThrow("Amount must be greater than 0");

      await expect(
        withdrawFromHotWallet(userId, -5, validAddress),
      ).rejects.toThrow("Amount must be greater than 0");
    });

    it("should throw if user has no hot wallet", async () => {
      // Create a user without a hot wallet
      const user = await User.create({
        _id: new mongoose.Types.ObjectId(),
        email: "no-wallet@example.com",
      });

      const validAddress = "0x" + "1".repeat(40);
      await expect(
        withdrawFromHotWallet(user.id, 1.0, validAddress),
      ).rejects.toThrow("No hot wallet found for this user");
    });

    it("should throw if insufficient balance", async () => {
      const { user } = await seedTestUser();

      // Mock getUsdcBalance via the public client readContract
      const { createPublicClient } = await import("viem");
      const mockReadContract = vi.fn().mockResolvedValue(BigInt(500000)); // 0.5 USDC
      vi.mocked(createPublicClient).mockReturnValue({
        readContract: mockReadContract,
      } as unknown as ReturnType<typeof createPublicClient>);

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
      } as unknown as ReturnType<typeof createPublicClient>);

      // Mock wallet client for transfer
      const mockWriteContract = vi.fn().mockResolvedValue(mockTxHash);
      vi.mocked(createWalletClient).mockReturnValue({
        writeContract: mockWriteContract,
      } as unknown as ReturnType<typeof createWalletClient>);

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
      const tx = await Transaction.findOne({
        userId: new mongoose.Types.ObjectId(user.id),
        type: "withdrawal",
      }).lean();
      expect(tx).not.toBeNull();
      expect(tx!.txHash).toBe(mockTxHash);
      expect(tx!.amount).toBe(1.0);
      expect(tx!.endpoint).toBe(`withdrawal:${toAddress}`);
      expect(tx!.status).toBe("completed");
    });

    it("should withdraw from specific chain wallet", async () => {
      const { user } = await seedTestUser();
      // Create an additional wallet on Arbitrum (42161)
      const arbWalletData = createTestHotWallet(user.id, { chainId: 42161 });
      await HotWalletModel.create(arbWalletData);

      const mockTxHash = "0x" + "a".repeat(64);

      const { createPublicClient, createWalletClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValue({
        readContract: vi.fn().mockResolvedValue(BigInt(10_000_000)),
      } as unknown as ReturnType<typeof createPublicClient>);
      vi.mocked(createWalletClient).mockReturnValue({
        writeContract: vi.fn().mockResolvedValue(mockTxHash),
      } as unknown as ReturnType<typeof createWalletClient>);

      const toAddress = "0x" + "2".repeat(40);
      const result = await withdrawFromHotWallet(user.id, 1.0, toAddress, 42161);

      expect(result.txHash).toBe(mockTxHash);

      // Verify transaction was logged with correct network string and chainId
      const tx = await Transaction.findOne({
        userId: new mongoose.Types.ObjectId(user.id),
        type: "withdrawal",
        network: "eip155:42161",
      }).lean();
      expect(tx).not.toBeNull();
      expect(tx!.chainId).toBe(42161);
    });
  });

  describe("multi-chain wallets", () => {
    beforeEach(async () => {
      await resetTestDb();
    });

    it("should allow creating wallets on two different chains for same user", async () => {
      const { user } = await seedTestUser(); // creates wallet with default chainId

      // Create wallet on Arbitrum
      const arbWalletData = createTestHotWallet(user.id, { chainId: 42161 });
      await HotWalletModel.create(arbWalletData);

      // Verify both wallets exist
      const wallets = await HotWalletModel.find({ userId: user._id }).lean();
      expect(wallets).toHaveLength(2);

      const chainIds = wallets.map((w) => w.chainId).sort();
      const defaultChainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "8453", 10);
      expect(chainIds).toEqual([defaultChainId, 42161].sort());
    });

    it("should enforce unique constraint on userId + chainId", async () => {
      const { user } = await seedTestUser();
      const defaultChainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "8453", 10);

      // Try to create another wallet on the same chain
      const duplicateData = createTestHotWallet(user.id, {
        address: "0x" + "9".repeat(40),
        chainId: defaultChainId,
      });

      await expect(HotWalletModel.create(duplicateData)).rejects.toThrow();
    });
  });
});
