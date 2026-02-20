import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Address, Hex } from "viem";
import {
  createSessionKey,
  computeSmartAccountAddress,
  createSmartAccountSigner,
  createSmartAccountSignerFromSerialized,
} from "../smart-account";
import { decryptPrivateKey } from "../hot-wallet";
import { TEST_PRIVATE_KEY } from "../../test/helpers/crypto";

// ---------------------------------------------------------------------------
// Mocks — prevent real RPC calls and ZeroDev SDK network access
// ---------------------------------------------------------------------------

const MOCK_SA_ADDRESS: Address =
  "0xc7B29D24De8F48186106E9Fd42584776D2a915e8";
const MOCK_SIGNATURE: Hex = "0xdeadbeef";

// Mock permissionless — toKernelSmartAccount (used by computeSmartAccountAddress)
vi.mock("permissionless/accounts", () => ({
  toKernelSmartAccount: vi.fn(async () => ({
    address: MOCK_SA_ADDRESS,
  })),
}));

// Mock @zerodev/sdk — createKernelAccount + addressToEmptyAccount
vi.mock("@zerodev/sdk", () => ({
  createKernelAccount: vi.fn(async (_client: unknown, opts: { address?: Address }) => ({
    address: opts?.address ?? MOCK_SA_ADDRESS,
    signTypedData: vi.fn(async () => MOCK_SIGNATURE),
  })),
  addressToEmptyAccount: vi.fn((address: Address) => ({
    type: "local" as const,
    address,
    publicKey: "0x",
    source: "empty",
    signMessage: async () => {
      throw new Error("not supported");
    },
    signTransaction: async () => {
      throw new Error("not supported");
    },
    signTypedData: async () => {
      throw new Error("not supported");
    },
  })),
}));

// Mock @zerodev/permissions
vi.mock("@zerodev/permissions", () => ({
  toPermissionValidator: vi.fn(async () => ({
    address: "0x0000000000000000000000000000000000000001",
    getIdentifier: () => "0x01",
  })),
  deserializePermissionAccount: vi.fn(async () => ({
    address: MOCK_SA_ADDRESS,
    signTypedData: vi.fn(async () => MOCK_SIGNATURE),
  })),
}));

// Mock @zerodev/permissions/signers
vi.mock("@zerodev/permissions/signers", () => ({
  toECDSASigner: vi.fn(async () => ({
    type: "local",
    address: "0x0000000000000000000000000000000000000002",
  })),
}));

// Mock @zerodev/permissions/policies
vi.mock("@zerodev/permissions/policies", () => ({
  toSudoPolicy: vi.fn(() => ({})),
}));

// Mock viem to avoid real RPC calls (publicClient creation)
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: vi.fn(),
      getCode: vi.fn(),
      call: vi.fn(),
    })),
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("smart-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createSessionKey", () => {
    it("should return a valid Ethereum address", () => {
      const key = createSessionKey();
      expect(key.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it("should return an encrypted private key in iv:authTag:encrypted format", () => {
      const key = createSessionKey();
      const parts = key.encryptedPrivateKey.split(":");
      expect(parts).toHaveLength(3);
      expect(parts[0]).toMatch(/^[0-9a-f]{24}$/); // IV: 12 bytes
      expect(parts[1]).toMatch(/^[0-9a-f]{32}$/); // Auth tag: 16 bytes
      expect(parts[2]).toMatch(/^[0-9a-f]+$/); // Encrypted data
    });

    it("should decrypt to a key that derives the same address", async () => {
      const key = createSessionKey();
      const decryptedKey = decryptPrivateKey(key.encryptedPrivateKey);
      const { privateKeyToAccount } = await import("viem/accounts");
      const account = privateKeyToAccount(decryptedKey as Hex);
      expect(account.address).toBe(key.address);
    });

    it("should generate different keys each time", () => {
      const key1 = createSessionKey();
      const key2 = createSessionKey();
      expect(key1.address).not.toBe(key2.address);
    });
  });

  describe("computeSmartAccountAddress", () => {
    it("should return a valid address", async () => {
      const address = await computeSmartAccountAddress(
        "0x947Af7ad155f299a768874F73B3223f4a93260C6",
        84532,
      );
      expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it("should return a deterministic address for the same inputs", async () => {
      const ownerAddress: Address =
        "0x947Af7ad155f299a768874F73B3223f4a93260C6";
      const addr1 = await computeSmartAccountAddress(ownerAddress, 84532);
      const addr2 = await computeSmartAccountAddress(ownerAddress, 84532);
      expect(addr1).toBe(addr2);
    });

    it("should pass the owner address to addressToEmptyAccount", async () => {
      const { addressToEmptyAccount } = await import("@zerodev/sdk");
      const ownerAddress: Address =
        "0x947Af7ad155f299a768874F73B3223f4a93260C6";
      await computeSmartAccountAddress(ownerAddress, 84532);
      expect(addressToEmptyAccount).toHaveBeenCalledWith(ownerAddress);
    });

    it("should throw for unsupported chain", async () => {
      await expect(
        computeSmartAccountAddress(
          "0x947Af7ad155f299a768874F73B3223f4a93260C6",
          99999,
        ),
      ).rejects.toThrow("Unsupported chain: 99999");
    });
  });

  describe("createSmartAccountSigner", () => {
    it("should return a ClientEvmSigner with the smart account address", async () => {
      const signer = await createSmartAccountSigner(
        TEST_PRIVATE_KEY,
        MOCK_SA_ADDRESS,
        84532,
      );
      expect(signer.address).toBe(MOCK_SA_ADDRESS);
    });

    it("should return a signer with a signTypedData function", async () => {
      const signer = await createSmartAccountSigner(
        TEST_PRIVATE_KEY,
        MOCK_SA_ADDRESS,
        84532,
      );
      expect(typeof signer.signTypedData).toBe("function");
    });

    it("should delegate signTypedData to the kernel account", async () => {
      const signer = await createSmartAccountSigner(
        TEST_PRIVATE_KEY,
        MOCK_SA_ADDRESS,
        84532,
      );

      const sig = await signer.signTypedData({
        domain: { name: "Test" },
        types: { Test: [{ name: "value", type: "uint256" }] },
        primaryType: "Test",
        message: { value: "1" },
      });

      expect(sig).toBe(MOCK_SIGNATURE);
    });

    it("should throw for unsupported chain", async () => {
      await expect(
        createSmartAccountSigner(TEST_PRIVATE_KEY, MOCK_SA_ADDRESS, 99999),
      ).rejects.toThrow("Unsupported chain: 99999");
    });
  });

  describe("createSmartAccountSignerFromSerialized", () => {
    it("should return a ClientEvmSigner with the deserialized account address", async () => {
      const signer = await createSmartAccountSignerFromSerialized(
        "serialized-account-data",
        TEST_PRIVATE_KEY,
        84532,
      );
      expect(signer.address).toBe(MOCK_SA_ADDRESS);
    });

    it("should delegate signTypedData to the deserialized kernel account", async () => {
      const signer = await createSmartAccountSignerFromSerialized(
        "serialized-account-data",
        TEST_PRIVATE_KEY,
        84532,
      );

      const sig = await signer.signTypedData({
        domain: { name: "Test" },
        types: { Test: [{ name: "value", type: "uint256" }] },
        primaryType: "Test",
        message: { value: "1" },
      });

      expect(sig).toBe(MOCK_SIGNATURE);
    });

    it("should pass the serialized data to deserializePermissionAccount", async () => {
      const { deserializePermissionAccount } = await import(
        "@zerodev/permissions"
      );
      const serialized = "test-serialized-data";

      await createSmartAccountSignerFromSerialized(
        serialized,
        TEST_PRIVATE_KEY,
        84532,
      );

      expect(deserializePermissionAccount).toHaveBeenCalledWith(
        expect.anything(), // publicClient
        expect.objectContaining({ version: "0.7" }), // entryPoint
        "0.3.3", // kernelVersion
        serialized, // serializedAccount
        expect.anything(), // ecdsaSigner
      );
    });

    it("should throw for unsupported chain", async () => {
      await expect(
        createSmartAccountSignerFromSerialized(
          "serialized-data",
          TEST_PRIVATE_KEY,
          99999,
        ),
      ).rejects.toThrow("Unsupported chain: 99999");
    });
  });
});
