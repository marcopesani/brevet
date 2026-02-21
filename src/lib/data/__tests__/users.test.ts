import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import mongoose from "mongoose";
import { User } from "@/lib/models/user";
import {
  ensureApiKey,
  getUserByApiKey,
  rotateApiKey,
  getApiKeyPrefix,
} from "../users";

/** Generate a valid ObjectId string that does not exist in the DB. */
const nonExistentId = () => new mongoose.Types.ObjectId().toString();

describe("ensureApiKey", () => {
  it("creates an API key for a new user without one", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });

    const result = await ensureApiKey(user._id.toString());

    expect(result.created).toBe(true);
    if (result.created) {
      expect(result.rawKey).toMatch(/^brv_[0-9a-f]{32}$/);
    }

    const updated = await User.findById(user._id).lean();
    expect(updated!.apiKeyHash).toBeTruthy();
    expect(updated!.apiKeyPrefix).toBe(
      result.created ? result.rawKey.slice(0, 8) : undefined,
    );
  });

  it("is idempotent — returns created: false when key already exists", async () => {
    const user = await User.create({ walletAddress: "0xUser2" });

    const first = await ensureApiKey(user._id.toString());
    expect(first.created).toBe(true);

    const second = await ensureApiKey(user._id.toString());
    expect(second.created).toBe(false);

    // Hash should not change
    const updated = await User.findById(user._id).lean();
    const expectedHash = createHash("sha256")
      .update((first as { created: true; rawKey: string }).rawKey)
      .digest("hex");
    expect(updated!.apiKeyHash).toBe(expectedHash);
  });

  it("throws for non-existent user", async () => {
    await expect(ensureApiKey(nonExistentId())).rejects.toThrow(
      "User not found",
    );
  });

  it("handles concurrent creation without error", async () => {
    const user = await User.create({ walletAddress: "0xConcurrent" });

    const [r1, r2] = await Promise.all([
      ensureApiKey(user._id.toString()),
      ensureApiKey(user._id.toString()),
    ]);

    // Exactly one should have created: true
    const createdCount = [r1, r2].filter((r) => r.created).length;
    expect(createdCount).toBeLessThanOrEqual(1);

    // User should have exactly one key
    const updated = await User.findById(user._id).lean();
    expect(updated!.apiKeyHash).toBeTruthy();
  });
});

describe("getUserByApiKey", () => {
  it("finds user by valid raw API key", async () => {
    const user = await User.create({ walletAddress: "0xLookup" });
    const result = await ensureApiKey(user._id.toString());
    expect(result.created).toBe(true);

    const rawKey = (result as { created: true; rawKey: string }).rawKey;
    const found = await getUserByApiKey(rawKey);

    expect(found).not.toBeNull();
    expect(found!.userId).toBe(user._id.toString());
  });

  it("returns null for invalid API key", async () => {
    const found = await getUserByApiKey("brv_0000000000000000000000000000dead");
    expect(found).toBeNull();
  });

  it("returns null for empty string", async () => {
    const found = await getUserByApiKey("");
    expect(found).toBeNull();
  });
});

describe("rotateApiKey", () => {
  it("generates a new key and invalidates the old one", async () => {
    const user = await User.create({ walletAddress: "0xRotate" });
    const first = await ensureApiKey(user._id.toString());
    expect(first.created).toBe(true);

    const oldKey = (first as { created: true; rawKey: string }).rawKey;
    const { rawKey: newKey } = await rotateApiKey(user._id.toString());

    expect(newKey).toMatch(/^brv_[0-9a-f]{32}$/);
    expect(newKey).not.toBe(oldKey);

    // Old key should no longer work
    const oldLookup = await getUserByApiKey(oldKey);
    expect(oldLookup).toBeNull();

    // New key should work
    const newLookup = await getUserByApiKey(newKey);
    expect(newLookup).not.toBeNull();
    expect(newLookup!.userId).toBe(user._id.toString());
  });

  it("throws for non-existent user", async () => {
    await expect(rotateApiKey(nonExistentId())).rejects.toThrow(
      "User not found",
    );
  });
});

describe("getApiKeyPrefix", () => {
  it("returns the stored prefix", async () => {
    const user = await User.create({ walletAddress: "0xPrefix" });
    const result = await ensureApiKey(user._id.toString());
    expect(result.created).toBe(true);

    const prefix = await getApiKeyPrefix(user._id.toString());
    expect(prefix).toBe(
      (result as { created: true; rawKey: string }).rawKey.slice(0, 8),
    );
  });

  it("returns null for user without API key", async () => {
    const user = await User.create({ walletAddress: "0xNoKey" });
    const prefix = await getApiKeyPrefix(user._id.toString());
    expect(prefix).toBeNull();
  });

  it("returns null for non-existent user", async () => {
    const prefix = await getApiKeyPrefix(nonExistentId());
    expect(prefix).toBeNull();
  });
});
