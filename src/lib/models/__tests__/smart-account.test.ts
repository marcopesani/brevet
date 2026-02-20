import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { SmartAccount } from "../smart-account";

const defaultChainId = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || "8453",
  10,
);

function buildSmartAccountData(
  overrides: Record<string, unknown> = {},
) {
  return {
    userId: new mongoose.Types.ObjectId(),
    chainId: defaultChainId,
    ownerAddress: "0x" + "a".repeat(40),
    smartAccountAddress: "0x" + "b".repeat(40),
    smartAccountVersion: "0.3.3",
    sessionKeyAddress: "0x" + "c".repeat(40),
    sessionKeyEncrypted: "iv:authtag:ciphertext",
    sessionKeyStatus: "pending_grant" as const,
    ...overrides,
  };
}

describe("SmartAccount model", () => {
  it("should create a document with all required fields", async () => {
    const data = buildSmartAccountData();
    const doc = await SmartAccount.create(data);

    expect(doc.userId.toString()).toBe(data.userId.toString());
    expect(doc.chainId).toBe(defaultChainId);
    expect(doc.ownerAddress).toBe(data.ownerAddress);
    expect(doc.smartAccountAddress).toBe(data.smartAccountAddress);
    expect(doc.smartAccountVersion).toBe("0.3.3");
    expect(doc.sessionKeyAddress).toBe(data.sessionKeyAddress);
    expect(doc.sessionKeyEncrypted).toBe(data.sessionKeyEncrypted);
    expect(doc.sessionKeyStatus).toBe("pending_grant");
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
  });

  it("should default chainId to NEXT_PUBLIC_CHAIN_ID", async () => {
    const data = buildSmartAccountData();
    delete (data as Record<string, unknown>).chainId;
    const doc = await SmartAccount.create(data);
    expect(doc.chainId).toBe(defaultChainId);
  });

  it("should default smartAccountVersion to 0.3.3", async () => {
    const data = buildSmartAccountData();
    delete (data as Record<string, unknown>).smartAccountVersion;
    const doc = await SmartAccount.create(data);
    expect(doc.smartAccountVersion).toBe("0.3.3");
  });

  it("should default sessionKeyStatus to pending_grant", async () => {
    const data = buildSmartAccountData();
    delete (data as Record<string, unknown>).sessionKeyStatus;
    const doc = await SmartAccount.create(data);
    expect(doc.sessionKeyStatus).toBe("pending_grant");
  });

  it("should accept all valid sessionKeyStatus values", async () => {
    const statuses = [
      "pending_grant",
      "active",
      "expired",
      "revoked",
    ] as const;

    for (const status of statuses) {
      const data = buildSmartAccountData({
        userId: new mongoose.Types.ObjectId(),
        sessionKeyStatus: status,
      });
      const doc = await SmartAccount.create(data);
      expect(doc.sessionKeyStatus).toBe(status);
    }
  });

  it("should reject invalid sessionKeyStatus values", async () => {
    const data = buildSmartAccountData({
      sessionKeyStatus: "invalid_status",
    });
    await expect(SmartAccount.create(data)).rejects.toThrow();
  });

  it("should store optional fields when provided", async () => {
    const expiry = new Date("2026-12-31T00:00:00Z");
    const data = buildSmartAccountData({
      serializedAccount: "serialized-blob",
      sessionKeyGrantTxHash: "0x" + "d".repeat(64),
      sessionKeyExpiry: expiry,
      spendLimitPerTx: 10,
      spendLimitDaily: 100,
    });

    const doc = await SmartAccount.create(data);
    expect(doc.serializedAccount).toBe("serialized-blob");
    expect(doc.sessionKeyGrantTxHash).toBe("0x" + "d".repeat(64));
    expect(doc.sessionKeyExpiry!.toISOString()).toBe(expiry.toISOString());
    expect(doc.spendLimitPerTx).toBe(10);
    expect(doc.spendLimitDaily).toBe(100);
  });

  it("should leave optional fields undefined when not provided", async () => {
    const doc = await SmartAccount.create(buildSmartAccountData());
    expect(doc.serializedAccount).toBeUndefined();
    expect(doc.sessionKeyGrantTxHash).toBeUndefined();
    expect(doc.sessionKeyExpiry).toBeUndefined();
    expect(doc.spendLimitPerTx).toBeUndefined();
    expect(doc.spendLimitDaily).toBeUndefined();
  });

  it("should enforce unique compound index on userId + chainId", async () => {
    const userId = new mongoose.Types.ObjectId();
    const data = buildSmartAccountData({ userId });
    await SmartAccount.create(data);

    const duplicate = buildSmartAccountData({
      userId,
      smartAccountAddress: "0x" + "f".repeat(40),
    });
    await expect(SmartAccount.create(duplicate)).rejects.toThrow();
  });

  it("should allow same userId on different chains", async () => {
    const userId = new mongoose.Types.ObjectId();
    await SmartAccount.create(buildSmartAccountData({ userId, chainId: 8453 }));
    const doc2 = await SmartAccount.create(
      buildSmartAccountData({ userId, chainId: 84532 }),
    );
    expect(doc2.chainId).toBe(84532);
  });

  it("should require ownerAddress", async () => {
    const data = buildSmartAccountData();
    delete (data as Record<string, unknown>).ownerAddress;
    await expect(SmartAccount.create(data)).rejects.toThrow();
  });

  it("should require smartAccountAddress", async () => {
    const data = buildSmartAccountData();
    delete (data as Record<string, unknown>).smartAccountAddress;
    await expect(SmartAccount.create(data)).rejects.toThrow();
  });

  it("should require sessionKeyAddress", async () => {
    const data = buildSmartAccountData();
    delete (data as Record<string, unknown>).sessionKeyAddress;
    await expect(SmartAccount.create(data)).rejects.toThrow();
  });

  it("should require sessionKeyEncrypted", async () => {
    const data = buildSmartAccountData();
    delete (data as Record<string, unknown>).sessionKeyEncrypted;
    await expect(SmartAccount.create(data)).rejects.toThrow();
  });

  it("should expose virtual id field", async () => {
    const doc = await SmartAccount.create(buildSmartAccountData());
    expect(doc.id).toBe(doc._id.toString());
  });
});
