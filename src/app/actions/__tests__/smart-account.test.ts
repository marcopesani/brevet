import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetTestDb } from "@/test/helpers/db";
import { User } from "@/lib/models/user";
import { SmartAccount } from "@/lib/models/smart-account";
import {
  encryptTestPrivateKey,
  TEST_PRIVATE_KEY,
} from "@/test/helpers/crypto";
import mongoose from "mongoose";

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

// Mock auth
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(),
}));

// Mock smart-account module (RPC calls)
vi.mock("@/lib/smart-account", () => ({
  computeSmartAccountAddress: vi
    .fn()
    .mockResolvedValue("0xSmartAccountAddress1234567890abcdef12345678"),
  createSessionKey: vi.fn().mockReturnValue({
    address: "0xSessionKeyAddress1234567890abcdef12345678",
    encryptedPrivateKey: "encrypted-session-key",
  }),
}));

// Mock viem's createPublicClient for finalizeSessionKey tx verification
const mockGetTransactionReceipt = vi.fn();
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getTransactionReceipt: mockGetTransactionReceipt,
    })),
  };
});

const TEST_USER_ID = new mongoose.Types.ObjectId().toString();
const TEST_WALLET = "0x" + "a".repeat(40);

describe("setupSmartAccount server action", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetTestDb();
  });

  it("creates a smart account for the authenticated user", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    await User.create({
      _id: new mongoose.Types.ObjectId(TEST_USER_ID),
      walletAddress: TEST_WALLET,
    });

    const { setupSmartAccount } = await import("../smart-account");
    const result = await setupSmartAccount(84532);

    expect(result.smartAccountAddress).toBe(
      "0xSmartAccountAddress1234567890abcdef12345678",
    );
    expect(result.chainId).toBe(84532);
    expect(result.sessionKeyStatus).toBe("pending_grant");

    // Verify record in DB
    const accounts = await SmartAccount.find({}).lean();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].ownerAddress).toBe(TEST_WALLET);
    expect(accounts[0].chainId).toBe(84532);
  });

  it("returns existing account on second call (idempotent)", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    await User.create({
      _id: new mongoose.Types.ObjectId(TEST_USER_ID),
      walletAddress: TEST_WALLET,
    });

    const { setupSmartAccount } = await import("../smart-account");
    const first = await setupSmartAccount(84532);
    const second = await setupSmartAccount(84532);

    expect(first.id).toBe(second.id);

    const accounts = await SmartAccount.find({}).lean();
    expect(accounts).toHaveLength(1);
  });

  it("throws for unauthenticated user", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const { setupSmartAccount } = await import("../smart-account");
    await expect(setupSmartAccount(84532)).rejects.toThrow("Unauthorized");
  });

  it("calls revalidatePath after creating account", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    await User.create({
      _id: new mongoose.Types.ObjectId(TEST_USER_ID),
      walletAddress: TEST_WALLET,
    });

    const { revalidatePath } = await import("next/cache");
    const { setupSmartAccount } = await import("../smart-account");
    await setupSmartAccount(84532);

    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/wallet");
  });
});

describe("prepareSessionKeyAuth server action", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetTestDb();
  });

  it("returns session key data for a pending_grant account", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    const encryptedKey = encryptTestPrivateKey(TEST_PRIVATE_KEY);
    await SmartAccount.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      ownerAddress: TEST_WALLET,
      chainId: 84532,
      smartAccountAddress: "0x" + "cc".repeat(20),
      sessionKeyAddress: "0x" + "dd".repeat(20),
      sessionKeyEncrypted: encryptedKey,
      sessionKeyStatus: "pending_grant",
    });

    const { prepareSessionKeyAuth } = await import("../smart-account");
    const result = await prepareSessionKeyAuth(84532);

    expect(result.sessionKeyHex).toBe(TEST_PRIVATE_KEY);
    expect(result.smartAccountAddress).toBe("0x" + "cc".repeat(20));
    expect(result.ownerAddress).toBe(TEST_WALLET);
    expect(result.chainId).toBe(84532);
  });

  it("throws for already active session key", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    const encryptedKey = encryptTestPrivateKey(TEST_PRIVATE_KEY);
    await SmartAccount.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      ownerAddress: TEST_WALLET,
      chainId: 84532,
      smartAccountAddress: "0x" + "cc".repeat(20),
      sessionKeyAddress: "0x" + "dd".repeat(20),
      sessionKeyEncrypted: encryptedKey,
      sessionKeyStatus: "active",
    });

    const { prepareSessionKeyAuth } = await import("../smart-account");
    await expect(prepareSessionKeyAuth(84532)).rejects.toThrow(
      "Session key cannot be authorized",
    );
  });

  it("throws for unauthenticated user", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const { prepareSessionKeyAuth } = await import("../smart-account");
    await expect(prepareSessionKeyAuth(84532)).rejects.toThrow("Unauthorized");
  });

  it("throws when smart account not found", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    const { prepareSessionKeyAuth } = await import("../smart-account");
    await expect(prepareSessionKeyAuth(84532)).rejects.toThrow(
      "Smart account not found",
    );
  });
});

describe("sendBundlerRequest server action", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetTestDb();
  });

  it("rejects disallowed methods", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    const { sendBundlerRequest } = await import("../smart-account");
    await expect(
      sendBundlerRequest(84532, "eth_getBalance", []),
    ).rejects.toThrow("Method not allowed: eth_getBalance");
  });

  it("throws for unauthenticated user", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const { sendBundlerRequest } = await import("../smart-account");
    await expect(
      sendBundlerRequest(84532, "eth_sendUserOperation", []),
    ).rejects.toThrow("Unauthorized");
  });

  it("throws when PIMLICO_API_KEY is not set", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    const originalKey = process.env.PIMLICO_API_KEY;
    delete process.env.PIMLICO_API_KEY;

    try {
      const { sendBundlerRequest } = await import("../smart-account");
      await expect(
        sendBundlerRequest(84532, "eth_sendUserOperation", []),
      ).rejects.toThrow("PIMLICO_API_KEY is not set");
    } finally {
      if (originalKey) process.env.PIMLICO_API_KEY = originalKey;
    }
  });
});

describe("finalizeSessionKey server action", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetTestDb();
    // Default: tx receipt succeeds
    mockGetTransactionReceipt.mockResolvedValue({ status: "success" });
  });

  it("activates session key after verifying tx receipt", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    const encryptedKey = encryptTestPrivateKey(TEST_PRIVATE_KEY);
    await SmartAccount.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      ownerAddress: TEST_WALLET,
      chainId: 84532,
      smartAccountAddress: "0x" + "cc".repeat(20),
      sessionKeyAddress: "0x" + "dd".repeat(20),
      sessionKeyEncrypted: encryptedKey,
      sessionKeyStatus: "pending_grant",
    });

    const { finalizeSessionKey } = await import("../smart-account");
    const result = await finalizeSessionKey(
      84532,
      "0x" + "ab".repeat(32),
      "serialized-account-data",
      50,
      500,
      30,
    );

    expect(result.success).toBe(true);
    expect(result.sessionKeyStatus).toBe("active");
    expect(result.grantTxHash).toBe("0x" + "ab".repeat(32));

    // Verify DB was updated
    const account = await SmartAccount.findOne({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      chainId: 84532,
    }).lean();
    expect(account?.sessionKeyStatus).toBe("active");
    expect(account?.sessionKeyGrantTxHash).toBe("0x" + "ab".repeat(32));
    expect(account?.spendLimitPerTx).toBe(50);
    expect(account?.spendLimitDaily).toBe(500);
    expect(account?.serializedAccount).toBeTruthy();
  });

  it("throws for unauthenticated user", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const { finalizeSessionKey } = await import("../smart-account");
    await expect(
      finalizeSessionKey(84532, "0x" + "ab".repeat(32), "data", 50, 500, 30),
    ).rejects.toThrow("Unauthorized");
  });

  it("returns error for failed grant transaction", async () => {
    mockGetTransactionReceipt.mockResolvedValue({ status: "reverted" });

    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    const { finalizeSessionKey } = await import("../smart-account");
    const result = await finalizeSessionKey(84532, "0x" + "ab".repeat(32), "data", 50, 500, 30);
    expect(result.success).toBe(false);
    expect("error" in result && result.error).toContain("Grant transaction failed");
  });

  it("calls revalidatePath after finalizing", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    const encryptedKey = encryptTestPrivateKey(TEST_PRIVATE_KEY);
    await SmartAccount.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      ownerAddress: TEST_WALLET,
      chainId: 84532,
      smartAccountAddress: "0x" + "cc".repeat(20),
      sessionKeyAddress: "0x" + "dd".repeat(20),
      sessionKeyEncrypted: encryptedKey,
      sessionKeyStatus: "pending_grant",
    });

    const { revalidatePath } = await import("next/cache");
    const { finalizeSessionKey } = await import("../smart-account");
    await finalizeSessionKey(
      84532,
      "0x" + "ab".repeat(32),
      "serialized-account-data",
      50,
      500,
      30,
    );

    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/wallet");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("rejects invalid grantTxHash format", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    const { finalizeSessionKey } = await import("../smart-account");
    const result = await finalizeSessionKey(
      84532,
      "not-a-valid-hash",
      "serialized-data",
      50_000_000,
      500_000_000,
      30,
    );

    expect(result.success).toBe(false);
    expect("error" in result && result.error).toContain("Invalid input");
  });

  it("rejects negative spendLimitPerTx", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    const { finalizeSessionKey } = await import("../smart-account");
    const result = await finalizeSessionKey(
      84532,
      "0x" + "ab".repeat(32),
      "serialized-data",
      -100,
      500_000_000,
      30,
    );

    expect(result.success).toBe(false);
    expect("error" in result && result.error).toContain("Invalid input");
  });

  it("rejects expiryDays out of range", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    const { finalizeSessionKey } = await import("../smart-account");
    const result = await finalizeSessionKey(
      84532,
      "0x" + "ab".repeat(32),
      "serialized-data",
      50_000_000,
      500_000_000,
      999,
    );

    expect(result.success).toBe(false);
    expect("error" in result && result.error).toContain("Invalid input");
  });

  it("rejects empty serializedAccount", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    const { finalizeSessionKey } = await import("../smart-account");
    const result = await finalizeSessionKey(
      84532,
      "0x" + "ab".repeat(32),
      "",
      50_000_000,
      500_000_000,
      30,
    );

    expect(result.success).toBe(false);
    expect("error" in result && result.error).toContain("Invalid input");
  });

  it("rejects non-integer spendLimitPerTx", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    const { finalizeSessionKey } = await import("../smart-account");
    const result = await finalizeSessionKey(
      84532,
      "0x" + "ab".repeat(32),
      "serialized-data",
      50.5,
      500_000_000,
      30,
    );

    expect(result.success).toBe(false);
    expect("error" in result && result.error).toContain("Invalid input");
  });
});

describe("sendBundlerRequest sender validation", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetTestDb();
  });

  it("rejects eth_sendUserOperation with mismatched sender", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    // Create smart account with known address
    await SmartAccount.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      ownerAddress: TEST_WALLET,
      chainId: 84532,
      smartAccountAddress: "0x" + "cc".repeat(20),
      sessionKeyAddress: "0x" + "dd".repeat(20),
      sessionKeyEncrypted: "encrypted-key",
      sessionKeyStatus: "active",
    });

    const { sendBundlerRequest } = await import("../smart-account");
    await expect(
      sendBundlerRequest(84532, "eth_sendUserOperation", [
        { sender: "0x" + "ee".repeat(20) }, // wrong sender
      ]),
    ).rejects.toThrow("UserOperation sender does not match your smart account");
  });

  it("rejects eth_sendUserOperation when no smart account exists", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: TEST_WALLET,
    });

    const { sendBundlerRequest } = await import("../smart-account");
    await expect(
      sendBundlerRequest(84532, "eth_sendUserOperation", [
        { sender: "0x" + "cc".repeat(20) },
      ]),
    ).rejects.toThrow("No smart account found for this chain");
  });
});
