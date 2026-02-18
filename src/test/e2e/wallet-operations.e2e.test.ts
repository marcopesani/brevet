import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAddress, createPublicClient, http, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { resetTestDb, seedTestUser } from "@/test/helpers/db";
import {
  TEST_PRIVATE_KEY,
  TEST_WALLET_ADDRESS,
  encryptTestPrivateKey,
} from "@/test/helpers/crypto";
import { getDefaultChainConfig } from "@/lib/chain-config";
import { createHotWallet, decryptPrivateKey } from "@/lib/hot-wallet";

describe("E2E: Wallet Operations", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(async () => {
    await resetTestDb();
  });

  describe("Hot wallet creation and validation", () => {
    it("should create a hot wallet with a valid Ethereum address", () => {
      const wallet = createHotWallet();

      expect(wallet.address).toBeDefined();
      expect(wallet.address.startsWith("0x")).toBe(true);
      expect(wallet.address.length).toBe(42);
      expect(isAddress(wallet.address)).toBe(true);
      expect(wallet.encryptedPrivateKey).toBeDefined();
      expect(wallet.encryptedPrivateKey).toContain(":");
    });

    it("should derive the correct address from the test private key", () => {
      const account = privateKeyToAccount(TEST_PRIVATE_KEY);
      expect(account.address).toBe(TEST_WALLET_ADDRESS);
    });

    it("should encrypt and decrypt a private key correctly", () => {
      const encrypted = encryptTestPrivateKey(TEST_PRIVATE_KEY);

      // Format: iv:authTag:encrypted (hex)
      const parts = encrypted.split(":");
      expect(parts.length).toBe(3);

      // Decrypt should return the original key
      const decrypted = decryptPrivateKey(encrypted);
      expect(decrypted).toBe(TEST_PRIVATE_KEY);
    });

    it("should produce different ciphertexts for the same key (random IV)", () => {
      const encrypted1 = encryptTestPrivateKey(TEST_PRIVATE_KEY);
      const encrypted2 = encryptTestPrivateKey(TEST_PRIVATE_KEY);
      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe("Base Sepolia RPC connectivity", () => {
    it("should connect to Base Sepolia and read USDC balanceOf", async () => {
      const client = createPublicClient({
        chain: baseSepolia,
        transport: http("https://sepolia.base.org"),
      });

      const USDC_ABI = [
        {
          name: "balanceOf",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
        },
      ] as const;

      const balance = await client.readContract({
        address: getDefaultChainConfig().usdcAddress,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [TEST_WALLET_ADDRESS],
      });

      // Balance is a bigint — the test wallet likely has 0 USDC on Sepolia
      expect(typeof balance).toBe("bigint");
      expect(balance).toBeGreaterThanOrEqual(BigInt(0));

      // Format as human-readable
      const formatted = formatUnits(balance, 6);
      expect(parseFloat(formatted)).toBeGreaterThanOrEqual(0);
    }, 15000); // 15s timeout for RPC call

    it("should use the correct chain config for Base Sepolia", () => {
      expect(getDefaultChainConfig().chain.id).toBe(84532);
      expect(getDefaultChainConfig().usdcAddress).toBe(
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      );
      expect(getDefaultChainConfig().networkString).toBe("eip155:84532");
      expect(getDefaultChainConfig().explorerUrl).toBe("https://sepolia.basescan.org");
    });

    it("should read USDC contract symbol on Sepolia to verify contract existence", async () => {
      const client = createPublicClient({
        chain: baseSepolia,
        transport: http("https://sepolia.base.org"),
      });

      const SYMBOL_ABI = [
        {
          name: "symbol",
          type: "function",
          stateMutability: "view",
          inputs: [],
          outputs: [{ name: "", type: "string" }],
        },
      ] as const;

      const symbol = await client.readContract({
        address: getDefaultChainConfig().usdcAddress,
        abi: SYMBOL_ABI,
        functionName: "symbol",
      });

      expect(symbol).toBe("USDC");
    }, 15000);
  });

  describe("Hot wallet in database", () => {
    it("should seed a user with hot wallet and verify address matches", async () => {
      const { hotWallet } = await seedTestUser();

      expect(hotWallet.address).toBe(TEST_WALLET_ADDRESS);
      expect(isAddress(hotWallet.address)).toBe(true);
      expect(hotWallet.encryptedPrivateKey).toBeDefined();
    });

    it("should decrypt the seeded hot wallet key to the test private key", async () => {
      const { hotWallet } = await seedTestUser();

      const decrypted = decryptPrivateKey(hotWallet.encryptedPrivateKey);
      expect(decrypted).toBe(TEST_PRIVATE_KEY);

      // Verify it derives to the correct address
      const account = privateKeyToAccount(decrypted as `0x${string}`);
      expect(account.address).toBe(hotWallet.address);
    });
  });
});
