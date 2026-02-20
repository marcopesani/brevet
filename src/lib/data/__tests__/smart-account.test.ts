import { describe, it, expect, vi } from "vitest";
import mongoose from "mongoose";
import { User } from "@/lib/models/user";
import { SmartAccount } from "@/lib/models/smart-account";
import {
  getSmartAccount,
  getSmartAccountWithSessionKey,
  getAllSmartAccounts,
  getSmartAccountBalance,
  createSmartAccountRecord,
  ensureSmartAccount,
  storeSerializedAccount,
  updateSessionKeyStatus,
  activateSessionKey,
} from "../smart-account";

vi.mock("@/lib/hot-wallet", () => ({
  getUsdcBalance: vi.fn().mockResolvedValue("50.000000"),
  createHotWallet: vi.fn(),
  encryptPrivateKey: vi.fn().mockReturnValue("encrypted-session-key"),
}));

vi.mock("@/lib/smart-account", () => ({
  computeSmartAccountAddress: vi.fn().mockResolvedValue("0xSmartAccountAddress"),
  createSessionKey: vi.fn().mockReturnValue({
    address: "0xSessionKeyAddress",
    encryptedPrivateKey: "encrypted-session-key",
  }),
}));

const DEFAULT_CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || "8453",
  10,
);

const nonExistentId = () => new mongoose.Types.ObjectId().toString();

async function createUserWithSmartAccount(overrides?: Partial<{
  chainId: number;
  ownerAddress: string;
  smartAccountAddress: string;
  sessionKeyAddress: string;
  sessionKeyEncrypted: string;
  sessionKeyStatus: string;
  serializedAccount: string;
}>) {
  const user = await User.create({ walletAddress: "0xUser1" });
  const sa = await SmartAccount.create({
    userId: user._id,
    chainId: overrides?.chainId ?? DEFAULT_CHAIN_ID,
    ownerAddress: overrides?.ownerAddress ?? "0xOwner",
    smartAccountAddress: overrides?.smartAccountAddress ?? "0xSmartAccount",
    sessionKeyAddress: overrides?.sessionKeyAddress ?? "0xSessionKey",
    sessionKeyEncrypted: overrides?.sessionKeyEncrypted ?? "encrypted-key",
    sessionKeyStatus: overrides?.sessionKeyStatus ?? "pending_grant",
    ...(overrides?.serializedAccount && { serializedAccount: overrides.serializedAccount }),
  });
  return { user, sa };
}

describe("getSmartAccount", () => {
  it("returns smart account record without sensitive fields", async () => {
    const { user } = await createUserWithSmartAccount();

    const result = await getSmartAccount(user._id.toString(), DEFAULT_CHAIN_ID);
    expect(result).not.toBeNull();
    expect(result!.smartAccountAddress).toBe("0xSmartAccount");
    expect(result!.ownerAddress).toBe("0xOwner");
    expect("sessionKeyEncrypted" in result!).toBe(false);
    expect("serializedAccount" in result!).toBe(false);
  });

  it("returns null when no smart account exists", async () => {
    const result = await getSmartAccount(nonExistentId(), DEFAULT_CHAIN_ID);
    expect(result).toBeNull();
  });

  it("returns account for specific chain only", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    await SmartAccount.create({
      userId: user._id,
      chainId: DEFAULT_CHAIN_ID,
      ownerAddress: "0xOwner",
      smartAccountAddress: "0xSA_Base",
      sessionKeyAddress: "0xSK1",
      sessionKeyEncrypted: "enc1",
    });
    await SmartAccount.create({
      userId: user._id,
      chainId: 42161,
      ownerAddress: "0xOwner",
      smartAccountAddress: "0xSA_Arb",
      sessionKeyAddress: "0xSK2",
      sessionKeyEncrypted: "enc2",
    });

    const baseResult = await getSmartAccount(user._id.toString(), DEFAULT_CHAIN_ID);
    expect(baseResult!.smartAccountAddress).toBe("0xSA_Base");

    const arbResult = await getSmartAccount(user._id.toString(), 42161);
    expect(arbResult!.smartAccountAddress).toBe("0xSA_Arb");
  });
});

describe("getSmartAccountWithSessionKey", () => {
  it("returns smart account including sessionKeyEncrypted and serializedAccount", async () => {
    const { user } = await createUserWithSmartAccount({
      sessionKeyEncrypted: "secret-enc-key",
      serializedAccount: "serialized-blob",
    });

    const result = await getSmartAccountWithSessionKey(user._id.toString(), DEFAULT_CHAIN_ID);
    expect(result).not.toBeNull();
    expect(result!.sessionKeyEncrypted).toBe("secret-enc-key");
    expect(result!.serializedAccount).toBe("serialized-blob");
  });

  it("returns null when no smart account exists", async () => {
    const result = await getSmartAccountWithSessionKey(nonExistentId(), DEFAULT_CHAIN_ID);
    expect(result).toBeNull();
  });
});

describe("getAllSmartAccounts", () => {
  it("returns all smart accounts across chains without sensitive fields", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    await SmartAccount.create({
      userId: user._id,
      chainId: DEFAULT_CHAIN_ID,
      ownerAddress: "0xOwner",
      smartAccountAddress: "0xSA1",
      sessionKeyAddress: "0xSK1",
      sessionKeyEncrypted: "secret1",
    });
    await SmartAccount.create({
      userId: user._id,
      chainId: 42161,
      ownerAddress: "0xOwner",
      smartAccountAddress: "0xSA2",
      sessionKeyAddress: "0xSK2",
      sessionKeyEncrypted: "secret2",
    });

    const results = await getAllSmartAccounts(user._id.toString());
    expect(results).toHaveLength(2);
    for (const sa of results) {
      expect("sessionKeyEncrypted" in sa).toBe(false);
      expect("serializedAccount" in sa).toBe(false);
    }
  });

  it("returns empty array when no smart accounts exist", async () => {
    const results = await getAllSmartAccounts(nonExistentId());
    expect(results).toHaveLength(0);
  });
});

describe("getSmartAccountBalance", () => {
  it("returns balance and address from smart account", async () => {
    const { user } = await createUserWithSmartAccount({
      smartAccountAddress: "0xBalanceAddr",
    });

    const result = await getSmartAccountBalance(user._id.toString(), DEFAULT_CHAIN_ID);
    expect(result).not.toBeNull();
    expect(result!.address).toBe("0xBalanceAddr");
    expect(result!.balance).toBe("50.000000");
  });

  it("returns null when no smart account exists", async () => {
    const result = await getSmartAccountBalance(nonExistentId());
    expect(result).toBeNull();
  });

  it("uses DEFAULT_CHAIN_ID when chainId is not provided", async () => {
    const { user } = await createUserWithSmartAccount();

    const result = await getSmartAccountBalance(user._id.toString());
    expect(result).not.toBeNull();
  });
});

describe("createSmartAccountRecord", () => {
  it("creates a new smart account record", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });

    const result = await createSmartAccountRecord({
      userId: user._id.toString(),
      ownerAddress: "0xOwner",
      chainId: DEFAULT_CHAIN_ID,
      smartAccountAddress: "0xSA",
      sessionKeyAddress: "0xSK",
      sessionKeyEncrypted: "enc-key",
    });

    expect(result.smartAccountAddress).toBe("0xSA");
    expect(result.sessionKeyStatus).toBe("pending_grant");
    expect(result.id).toBeDefined();
    expect(result.userId).toBe(user._id.toString());
  });

  it("rejects duplicate (userId, chainId) pair", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    const data = {
      userId: user._id.toString(),
      ownerAddress: "0xOwner",
      chainId: DEFAULT_CHAIN_ID,
      smartAccountAddress: "0xSA1",
      sessionKeyAddress: "0xSK1",
      sessionKeyEncrypted: "enc1",
    };

    await createSmartAccountRecord(data);
    await expect(
      createSmartAccountRecord({ ...data, smartAccountAddress: "0xSA2" }),
    ).rejects.toThrow();
  });
});

describe("ensureSmartAccount", () => {
  it("returns existing smart account without creating a new one", async () => {
    const { user, sa } = await createUserWithSmartAccount({
      smartAccountAddress: "0xExisting",
    });

    const result = await ensureSmartAccount(
      user._id.toString(),
      "0xOwner",
      DEFAULT_CHAIN_ID,
    );
    expect(result.smartAccountAddress).toBe("0xExisting");
    expect(result.id).toBe(sa._id.toString());
  });

  it("creates a new smart account when none exists", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });

    const result = await ensureSmartAccount(
      user._id.toString(),
      "0xOwner",
      DEFAULT_CHAIN_ID,
    );
    expect(result.smartAccountAddress).toBe("0xSmartAccountAddress");
    expect(result.sessionKeyAddress).toBe("0xSessionKeyAddress");
    expect(result.sessionKeyEncrypted).toBe("encrypted-session-key");
    expect(result.sessionKeyStatus).toBe("pending_grant");
  });

  it("is idempotent — second call returns the same record", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });

    const first = await ensureSmartAccount(
      user._id.toString(),
      "0xOwner",
      DEFAULT_CHAIN_ID,
    );
    const second = await ensureSmartAccount(
      user._id.toString(),
      "0xOwner",
      DEFAULT_CHAIN_ID,
    );
    expect(first.id).toBe(second.id);

    const count = await SmartAccount.countDocuments({
      userId: new mongoose.Types.ObjectId(user._id.toString()),
    });
    expect(count).toBe(1);
  });

  it("handles concurrent duplicate creation gracefully (race condition)", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    const uid = user._id.toString();

    // Simulate race: both calls pass the findOne check, one succeeds at create,
    // the other gets a duplicate key error and should re-fetch the existing doc.
    const [result1, result2] = await Promise.all([
      ensureSmartAccount(uid, "0xOwner", DEFAULT_CHAIN_ID),
      ensureSmartAccount(uid, "0xOwner", DEFAULT_CHAIN_ID),
    ]);

    // Both should return valid records with the same id
    expect(result1.id).toBe(result2.id);

    // Only one document should exist
    const count = await SmartAccount.countDocuments({
      userId: new mongoose.Types.ObjectId(uid),
      chainId: DEFAULT_CHAIN_ID,
    });
    expect(count).toBe(1);
  });

  it("creates separate accounts for different chains", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });

    await ensureSmartAccount(user._id.toString(), "0xOwner", DEFAULT_CHAIN_ID);
    await ensureSmartAccount(user._id.toString(), "0xOwner", 42161);

    const count = await SmartAccount.countDocuments({
      userId: user._id,
    });
    expect(count).toBe(2);
  });
});

describe("storeSerializedAccount", () => {
  it("stores serialized account on existing record", async () => {
    const { user } = await createUserWithSmartAccount();

    const result = await storeSerializedAccount(
      user._id.toString(),
      DEFAULT_CHAIN_ID,
      "serialized-blob-encrypted",
    );
    expect(result).not.toBeNull();
    expect(result!.serializedAccount).toBe("serialized-blob-encrypted");
  });

  it("returns null when no smart account exists", async () => {
    const result = await storeSerializedAccount(
      nonExistentId(),
      DEFAULT_CHAIN_ID,
      "blob",
    );
    expect(result).toBeNull();
  });
});

describe("updateSessionKeyStatus", () => {
  it("updates session key status to active", async () => {
    const { user } = await createUserWithSmartAccount({
      sessionKeyStatus: "pending_grant",
    });

    const result = await updateSessionKeyStatus(
      user._id.toString(),
      DEFAULT_CHAIN_ID,
      "active",
    );
    expect(result).not.toBeNull();
    expect(result!.sessionKeyStatus).toBe("active");
  });

  it("stores grant tx hash when provided", async () => {
    const { user } = await createUserWithSmartAccount();

    const result = await updateSessionKeyStatus(
      user._id.toString(),
      DEFAULT_CHAIN_ID,
      "active",
      "0xGrantTxHash",
    );
    expect(result).not.toBeNull();
    expect(result!.sessionKeyGrantTxHash).toBe("0xGrantTxHash");
  });

  it("transitions through status lifecycle", async () => {
    const { user } = await createUserWithSmartAccount({
      sessionKeyStatus: "pending_grant",
    });
    const uid = user._id.toString();

    let result = await updateSessionKeyStatus(uid, DEFAULT_CHAIN_ID, "active", "0xTx");
    expect(result!.sessionKeyStatus).toBe("active");

    result = await updateSessionKeyStatus(uid, DEFAULT_CHAIN_ID, "expired");
    expect(result!.sessionKeyStatus).toBe("expired");

    result = await updateSessionKeyStatus(uid, DEFAULT_CHAIN_ID, "revoked");
    expect(result!.sessionKeyStatus).toBe("revoked");
  });

  it("returns null when no smart account exists", async () => {
    const result = await updateSessionKeyStatus(
      nonExistentId(),
      DEFAULT_CHAIN_ID,
      "active",
    );
    expect(result).toBeNull();
  });
});

describe("activateSessionKey", () => {
  it("activates session key with all fields", async () => {
    const { user } = await createUserWithSmartAccount({
      sessionKeyStatus: "pending_grant",
    });

    const expiryDate = new Date(Date.now() + 30 * 86400_000);
    const result = await activateSessionKey(
      user._id.toString(),
      DEFAULT_CHAIN_ID,
      "0xGrantTxHash123",
      expiryDate,
      50_000_000,
      500_000_000,
    );

    expect(result).not.toBeNull();
    expect(result!.sessionKeyStatus).toBe("active");
    expect(result!.sessionKeyGrantTxHash).toBe("0xGrantTxHash123");
    expect(result!.spendLimitPerTx).toBe(50_000_000);
    expect(result!.spendLimitDaily).toBe(500_000_000);
    expect(result!.sessionKeyExpiry).toBeDefined();
  });

  it("returns null when no smart account exists", async () => {
    const result = await activateSessionKey(
      nonExistentId(),
      DEFAULT_CHAIN_ID,
      "0xGrantTxHash",
      new Date(),
      50_000_000,
      500_000_000,
    );
    expect(result).toBeNull();
  });
});
