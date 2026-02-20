import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetTestDb } from "@/test/helpers/db";
import { User } from "@/lib/models/user";
import { SmartAccount } from "@/lib/models/smart-account";
import mongoose from "mongoose";

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
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
