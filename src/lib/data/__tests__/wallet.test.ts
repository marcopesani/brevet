import { describe, it, expect, vi } from "vitest";
import mongoose from "mongoose";
import { User } from "@/lib/models/user";
import { HotWallet } from "@/lib/models/hot-wallet";
import { EndpointPolicy } from "@/lib/models/endpoint-policy";
import { getWalletBalance, ensureHotWallet, getHotWallet, getUserWithWalletAndPolicies } from "../wallet";

vi.mock("@/lib/hot-wallet", () => ({
  getUsdcBalance: vi.fn().mockResolvedValue("100.000000"),
  createHotWallet: vi.fn().mockReturnValue({
    address: "0xNewWallet",
    encryptedPrivateKey: "encrypted-key",
  }),
  withdrawFromHotWallet: vi.fn().mockResolvedValue({ txHash: "0xtx" }),
}));

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

  it("returns null when no hot wallet", async () => {
    const result = await getHotWallet(nonExistentId());
    expect(result).toBeNull();
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
});
