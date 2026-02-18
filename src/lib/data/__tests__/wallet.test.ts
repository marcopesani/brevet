import { describe, it, expect, vi } from "vitest";
import mongoose from "mongoose";
import { User } from "@/lib/models/user";
import { HotWallet } from "@/lib/models/hot-wallet";
import { EndpointPolicy } from "@/lib/models/endpoint-policy";
import { getEnvironmentChains } from "@/lib/chain-config";
import { getWalletBalance, ensureHotWallet, ensureAllHotWallets, getHotWallet, getHotWalletWithKey, getAllHotWallets, getUserWithWalletAndPolicies } from "../wallet";

vi.mock("@/lib/hot-wallet", () => ({
  getUsdcBalance: vi.fn().mockResolvedValue("100.000000"),
  createHotWallet: vi.fn().mockReturnValue({
    address: "0xNewWallet",
    encryptedPrivateKey: "encrypted-key",
  }),
  withdrawFromHotWallet: vi.fn().mockResolvedValue({ txHash: "0xtx" }),
}));

const DEFAULT_CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || "8453",
  10,
);

/** Generate a valid ObjectId string that does not exist in the DB. */
const nonExistentId = () => new mongoose.Types.ObjectId().toString();

describe("getWalletBalance", () => {
  it("returns balance and address when hot wallet exists", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    await HotWallet.create({
      userId: user._id,
      address: "0xHotWallet",
      encryptedPrivateKey: "enc",
    });

    const result = await getWalletBalance(user._id.toString());
    expect(result).not.toBeNull();
    expect(result!.address).toBe("0xHotWallet");
    expect(result!.balance).toBe("100.000000");
  });

  it("returns null when user has no hot wallet", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    const result = await getWalletBalance(user._id.toString());
    expect(result).toBeNull();
  });

  it("returns null when user does not exist", async () => {
    const result = await getWalletBalance(nonExistentId());
    expect(result).toBeNull();
  });

  it("returns balance for a specific chain", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    await HotWallet.create({
      userId: user._id,
      address: "0xBaseWallet",
      encryptedPrivateKey: "enc",
      chainId: DEFAULT_CHAIN_ID,
    });
    await HotWallet.create({
      userId: user._id,
      address: "0xArbWallet",
      encryptedPrivateKey: "enc2",
      chainId: 42161,
    });

    const baseResult = await getWalletBalance(user._id.toString(), DEFAULT_CHAIN_ID);
    expect(baseResult).not.toBeNull();
    expect(baseResult!.address).toBe("0xBaseWallet");

    const arbResult = await getWalletBalance(user._id.toString(), 42161);
    expect(arbResult).not.toBeNull();
    expect(arbResult!.address).toBe("0xArbWallet");
  });
});

describe("ensureHotWallet", () => {
  it("returns existing hot wallet without creating a new one", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    await HotWallet.create({
      userId: user._id,
      address: "0xExisting",
      encryptedPrivateKey: "enc",
    });

    const result = await ensureHotWallet(user._id.toString());
    expect(result).not.toBeNull();
    expect(result!.address).toBe("0xExisting");
  });

  it("creates a new hot wallet when none exists", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });

    const result = await ensureHotWallet(user._id.toString());
    expect(result).not.toBeNull();
    expect(result!.address).toBe("0xNewWallet");
  });

  it("returns null when user does not exist", async () => {
    const result = await ensureHotWallet(nonExistentId());
    expect(result).toBeNull();
  });

  it("creates wallet for specific chain without affecting other chains", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    // Create default chain wallet
    await HotWallet.create({
      userId: user._id,
      address: "0xBaseWallet",
      encryptedPrivateKey: "enc",
      chainId: DEFAULT_CHAIN_ID,
    });

    // Ensure wallet on Arbitrum creates a new one
    const result = await ensureHotWallet(user._id.toString(), 42161);
    expect(result).not.toBeNull();
    expect(result!.address).toBe("0xNewWallet");

    // Verify two wallets exist
    const wallets = await HotWallet.find({ userId: user._id }).lean();
    expect(wallets).toHaveLength(2);
  });
});

describe("ensureAllHotWallets", () => {
  const envChains = getEnvironmentChains();

  it("creates wallets for all environment chains when none exist", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });

    const created = await ensureAllHotWallets(user._id.toString());

    expect(created).toBe(envChains.length);
    const wallets = await HotWallet.find({ userId: user._id }).lean();
    expect(wallets).toHaveLength(envChains.length);

    const chainIds = wallets.map((w) => w.chainId).sort();
    const expectedChainIds = envChains.map((c) => c.chain.id).sort();
    expect(chainIds).toEqual(expectedChainIds);
  });

  it("only creates missing chain wallets when some already exist", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    await HotWallet.create({
      userId: user._id,
      address: "0xExistingWallet",
      encryptedPrivateKey: "enc",
      chainId: envChains[0].chain.id,
    });

    const created = await ensureAllHotWallets(user._id.toString());

    expect(created).toBe(envChains.length - 1);
    const wallets = await HotWallet.find({ userId: user._id }).lean();
    expect(wallets).toHaveLength(envChains.length);
  });

  it("returns 0 when all wallets already exist", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    for (const chain of envChains) {
      await HotWallet.create({
        userId: user._id,
        address: `0xWallet${chain.chain.id}`,
        encryptedPrivateKey: "enc",
        chainId: chain.chain.id,
      });
    }

    const created = await ensureAllHotWallets(user._id.toString());
    expect(created).toBe(0);
  });

  it("returns 0 for non-existent user", async () => {
    const created = await ensureAllHotWallets(new mongoose.Types.ObjectId().toString());
    expect(created).toBe(0);
  });

  it("handles concurrent calls without crashing (duplicate key race condition)", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });

    // Run two concurrent calls — one may hit a duplicate key error
    const [count1, count2] = await Promise.all([
      ensureAllHotWallets(user._id.toString()),
      ensureAllHotWallets(user._id.toString()),
    ]);

    // Both should return the expected count (docs.length) without throwing
    expect(count1).toBe(envChains.length);
    expect(count2).toBe(envChains.length);

    // The final state should have exactly one wallet per chain
    const wallets = await HotWallet.find({ userId: user._id }).lean();
    expect(wallets).toHaveLength(envChains.length);
  });
});

describe("getHotWallet", () => {
  it("returns hot wallet for user", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    await HotWallet.create({
      userId: user._id,
      address: "0xHW",
      encryptedPrivateKey: "enc",
    });

    const result = await getHotWallet(user._id.toString());
    expect(result).not.toBeNull();
    expect(result!.address).toBe("0xHW");
  });

  it("excludes encryptedPrivateKey from result", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    await HotWallet.create({
      userId: user._id,
      address: "0xHW",
      encryptedPrivateKey: "secret-enc-key",
    });

    const result = await getHotWallet(user._id.toString());
    expect(result).not.toBeNull();
    expect(result!.address).toBe("0xHW");
    expect("encryptedPrivateKey" in result!).toBe(false);
  });

  it("returns null when no hot wallet", async () => {
    const result = await getHotWallet(nonExistentId());
    expect(result).toBeNull();
  });

  it("returns wallet for specific chain", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    await HotWallet.create({
      userId: user._id,
      address: "0xBaseHW",
      encryptedPrivateKey: "enc",
      chainId: DEFAULT_CHAIN_ID,
    });
    await HotWallet.create({
      userId: user._id,
      address: "0xArbHW",
      encryptedPrivateKey: "enc2",
      chainId: 42161,
    });

    const baseResult = await getHotWallet(user._id.toString(), DEFAULT_CHAIN_ID);
    expect(baseResult).not.toBeNull();
    expect(baseResult!.address).toBe("0xBaseHW");

    const arbResult = await getHotWallet(user._id.toString(), 42161);
    expect(arbResult).not.toBeNull();
    expect(arbResult!.address).toBe("0xArbHW");
  });
});

describe("getHotWalletWithKey", () => {
  it("returns hot wallet including encryptedPrivateKey", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    await HotWallet.create({
      userId: user._id,
      address: "0xHW",
      encryptedPrivateKey: "secret-enc-key",
    });

    const result = await getHotWalletWithKey(user._id.toString());
    expect(result).not.toBeNull();
    expect(result!.address).toBe("0xHW");
    expect(result!.encryptedPrivateKey).toBe("secret-enc-key");
  });

  it("returns null when no hot wallet", async () => {
    const result = await getHotWalletWithKey(nonExistentId());
    expect(result).toBeNull();
  });
});

describe("getAllHotWallets", () => {
  it("excludes encryptedPrivateKey from results", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    await HotWallet.create({
      userId: user._id,
      address: "0xHW1",
      encryptedPrivateKey: "secret-key-1",
      chainId: DEFAULT_CHAIN_ID,
    });
    await HotWallet.create({
      userId: user._id,
      address: "0xHW2",
      encryptedPrivateKey: "secret-key-2",
      chainId: 42161,
    });

    const results = await getAllHotWallets(user._id.toString());
    expect(results).toHaveLength(2);
    for (const wallet of results) {
      expect("encryptedPrivateKey" in wallet).toBe(false);
    }
  });
});

describe("getUserWithWalletAndPolicies", () => {
  it("returns user with hot wallet and policies", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    await HotWallet.create({
      userId: user._id,
      address: "0xHW",
      encryptedPrivateKey: "enc",
    });
    await EndpointPolicy.create({
      userId: user._id,
      endpointPattern: "https://a.com",
      status: "active",
    });

    const result = await getUserWithWalletAndPolicies(user._id.toString());
    expect(result).not.toBeNull();
    expect(result!.hotWallet).not.toBeNull();
    expect(result!.endpointPolicies).toHaveLength(1);
  });

  it("returns null for non-existent user", async () => {
    const result = await getUserWithWalletAndPolicies(nonExistentId());
    expect(result).toBeNull();
  });

  it("returns chain-specific wallet", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    await HotWallet.create({
      userId: user._id,
      address: "0xBaseHW",
      encryptedPrivateKey: "enc",
      chainId: DEFAULT_CHAIN_ID,
    });
    await HotWallet.create({
      userId: user._id,
      address: "0xArbHW",
      encryptedPrivateKey: "enc2",
      chainId: 42161,
    });

    const baseResult = await getUserWithWalletAndPolicies(user._id.toString(), DEFAULT_CHAIN_ID);
    expect(baseResult).not.toBeNull();
    expect(baseResult!.hotWallet!.address).toBe("0xBaseHW");

    const arbResult = await getUserWithWalletAndPolicies(user._id.toString(), 42161);
    expect(arbResult).not.toBeNull();
    expect(arbResult!.hotWallet!.address).toBe("0xArbHW");
  });
});
