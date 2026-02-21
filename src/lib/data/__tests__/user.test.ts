import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { User } from "@/lib/models/user";
import { Types } from "mongoose";
import {
  getUserEnabledChains,
  setUserEnabledChains,
  isChainEnabledForUser,
} from "../user";
import { upsertUser, getDefaultEnabledChains } from "@/lib/auth-config";
import { getTestnetChains, getMainnetChains } from "@/lib/chain-config";

const uid = () => new Types.ObjectId().toString();

const TESTNET_IDS = getTestnetChains().map((c) => c.chain.id);
const MAINNET_IDS = getMainnetChains().map((c) => c.chain.id);

describe("User model enabledChains", () => {
  it("defaults to empty array when created without enabledChains", async () => {
    const user = await User.create({ walletAddress: "0xabc" });
    expect(user.enabledChains).toEqual([]);
  });

  it("persists enabledChains when provided", async () => {
    const user = await User.create({
      walletAddress: "0xdef",
      enabledChains: [84532, 11155111],
    });
    expect(user.enabledChains).toEqual([84532, 11155111]);
  });
});

describe("getUserEnabledChains", () => {
  it("returns enabled chains for a user", async () => {
    const user = await User.create({
      walletAddress: "0x111",
      enabledChains: [84532, 421614],
    });
    const chains = await getUserEnabledChains(user._id.toString());
    expect(chains).toEqual([84532, 421614]);
  });

  it("returns empty array for user with no enabled chains", async () => {
    const user = await User.create({ walletAddress: "0x222" });
    const chains = await getUserEnabledChains(user._id.toString());
    expect(chains).toEqual([]);
  });

  it("returns empty array for non-existent user", async () => {
    const chains = await getUserEnabledChains(uid());
    expect(chains).toEqual([]);
  });
});

describe("setUserEnabledChains", () => {
  it("sets enabled chains for a user", async () => {
    const user = await User.create({ walletAddress: "0x333" });
    const result = await setUserEnabledChains(user._id.toString(), [
      84532, 8453,
    ]);
    expect(result).toEqual([84532, 8453]);

    // Verify persisted
    const chains = await getUserEnabledChains(user._id.toString());
    expect(chains).toEqual([84532, 8453]);
  });

  it("replaces existing chains", async () => {
    const user = await User.create({
      walletAddress: "0x444",
      enabledChains: [84532],
    });
    await setUserEnabledChains(user._id.toString(), [8453, 42161]);
    const chains = await getUserEnabledChains(user._id.toString());
    expect(chains).toEqual([8453, 42161]);
  });

  it("allows setting empty array (all disabled)", async () => {
    const user = await User.create({
      walletAddress: "0x555",
      enabledChains: [84532],
    });
    const result = await setUserEnabledChains(user._id.toString(), []);
    expect(result).toEqual([]);
  });

  it("rejects unknown chain IDs", async () => {
    const user = await User.create({ walletAddress: "0x666" });
    await expect(
      setUserEnabledChains(user._id.toString(), [84532, 999999]),
    ).rejects.toThrow("Unknown chain IDs: 999999");
  });

  it("rejects multiple unknown chain IDs", async () => {
    const user = await User.create({ walletAddress: "0x777" });
    await expect(
      setUserEnabledChains(user._id.toString(), [111111, 222222]),
    ).rejects.toThrow("Unknown chain IDs: 111111, 222222");
  });

  it("throws for non-existent user", async () => {
    await expect(setUserEnabledChains(uid(), [84532])).rejects.toThrow(
      "User not found",
    );
  });
});

describe("isChainEnabledForUser", () => {
  it("returns true for an enabled chain", async () => {
    const user = await User.create({
      walletAddress: "0x888",
      enabledChains: [84532, 8453],
    });
    const result = await isChainEnabledForUser(user._id.toString(), 84532);
    expect(result).toBe(true);
  });

  it("returns false for a disabled chain", async () => {
    const user = await User.create({
      walletAddress: "0x999",
      enabledChains: [84532],
    });
    const result = await isChainEnabledForUser(user._id.toString(), 8453);
    expect(result).toBe(false);
  });

  it("returns false when no chains are enabled", async () => {
    const user = await User.create({ walletAddress: "0xaaa" });
    const result = await isChainEnabledForUser(user._id.toString(), 84532);
    expect(result).toBe(false);
  });

  it("returns false for non-existent user", async () => {
    const result = await isChainEnabledForUser(uid(), 84532);
    expect(result).toBe(false);
  });
});

describe("upsertUser enabledChains defaults", () => {
  it("new user gets testnet chains enabled by default", async () => {
    const user = await upsertUser("0xnewuser1");
    expect(user.enabledChains).toEqual(expect.arrayContaining(TESTNET_IDS));
    expect(user.enabledChains).toHaveLength(TESTNET_IDS.length);
    // Should NOT include mainnet chains
    for (const mainnetId of MAINNET_IDS) {
      expect(user.enabledChains).not.toContain(mainnetId);
    }
  });

  it("existing user is not modified on upsert", async () => {
    // Create user with specific chains
    await User.create({
      walletAddress: "0xexisting",
      enabledChains: [84532],
    });
    // Upsert should find existing and NOT change enabledChains
    const user = await upsertUser("0xexisting");
    expect(user.enabledChains).toEqual([84532]);
  });
});

describe("getDefaultEnabledChains", () => {
  const originalEnv = process.env.DEFAULT_MAINNET_CHAINS_ENABLED;

  beforeEach(() => {
    delete process.env.DEFAULT_MAINNET_CHAINS_ENABLED;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DEFAULT_MAINNET_CHAINS_ENABLED = originalEnv;
    } else {
      delete process.env.DEFAULT_MAINNET_CHAINS_ENABLED;
    }
  });

  it("returns only testnet chains when env var is absent", () => {
    const chains = getDefaultEnabledChains();
    expect(chains).toEqual(TESTNET_IDS);
  });

  it("returns only testnet chains when env var is 'false'", () => {
    process.env.DEFAULT_MAINNET_CHAINS_ENABLED = "false";
    const chains = getDefaultEnabledChains();
    expect(chains).toEqual(TESTNET_IDS);
  });

  it("returns testnet + mainnet chains when env var is 'true'", () => {
    process.env.DEFAULT_MAINNET_CHAINS_ENABLED = "true";
    const chains = getDefaultEnabledChains();
    expect(chains).toEqual(expect.arrayContaining(TESTNET_IDS));
    expect(chains).toEqual(expect.arrayContaining(MAINNET_IDS));
    expect(chains).toHaveLength(TESTNET_IDS.length + MAINNET_IDS.length);
  });

  it("treats other string values as false", () => {
    process.env.DEFAULT_MAINNET_CHAINS_ENABLED = "yes";
    const chains = getDefaultEnabledChains();
    expect(chains).toEqual(TESTNET_IDS);
  });
});
