import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getWalletBalance, ensureHotWallet, getHotWallet, getUserWithWalletAndPolicies } from "../wallet";

vi.mock("@/lib/hot-wallet", () => ({
  getUsdcBalance: vi.fn().mockResolvedValue("100.000000"),
  createHotWallet: vi.fn().mockReturnValue({
    address: "0xNewWallet",
    encryptedPrivateKey: "encrypted-key",
  }),
  withdrawFromHotWallet: vi.fn().mockResolvedValue({ txHash: "0xtx" }),
}));

type PrismaMock = typeof prisma & { _stores: Record<string, unknown[]> };

beforeEach(() => {
  const mock = prisma as PrismaMock;
  for (const store of Object.values(mock._stores)) {
    (store as unknown[]).length = 0;
  }
});

describe("getWalletBalance", () => {
  it("returns balance and address when hot wallet exists", async () => {
    const user = await prisma.user.create({ data: { walletAddress: "0xUser1" } });
    await prisma.hotWallet.create({
      data: { userId: user.id, address: "0xHotWallet", encryptedPrivateKey: "enc" },
    });

    const result = await getWalletBalance(user.id);
    expect(result).not.toBeNull();
    expect(result!.address).toBe("0xHotWallet");
    expect(result!.balance).toBe("100.000000");
  });

  it("returns null when user has no hot wallet", async () => {
    const user = await prisma.user.create({ data: { walletAddress: "0xUser1" } });
    const result = await getWalletBalance(user.id);
    expect(result).toBeNull();
  });

  it("returns null when user does not exist", async () => {
    const result = await getWalletBalance("nonexistent");
    expect(result).toBeNull();
  });
});

describe("ensureHotWallet", () => {
  it("returns existing hot wallet without creating a new one", async () => {
    const user = await prisma.user.create({ data: { walletAddress: "0xUser1" } });
    await prisma.hotWallet.create({
      data: { userId: user.id, address: "0xExisting", encryptedPrivateKey: "enc" },
    });

    const result = await ensureHotWallet(user.id);
    expect(result).not.toBeNull();
    expect(result!.address).toBe("0xExisting");
  });

  it("creates a new hot wallet when none exists", async () => {
    const user = await prisma.user.create({ data: { walletAddress: "0xUser1" } });

    const result = await ensureHotWallet(user.id);
    expect(result).not.toBeNull();
    expect(result!.address).toBe("0xNewWallet");
  });

  it("returns null when user does not exist", async () => {
    const result = await ensureHotWallet("nonexistent");
    expect(result).toBeNull();
  });
});

describe("getHotWallet", () => {
  it("returns hot wallet for user", async () => {
    const user = await prisma.user.create({ data: { walletAddress: "0xUser1" } });
    await prisma.hotWallet.create({
      data: { userId: user.id, address: "0xHW", encryptedPrivateKey: "enc" },
    });

    const result = await getHotWallet(user.id);
    expect(result).not.toBeNull();
    expect(result!.address).toBe("0xHW");
  });

  it("returns null when no hot wallet", async () => {
    const result = await getHotWallet("nonexistent");
    expect(result).toBeNull();
  });
});

describe("getUserWithWalletAndPolicies", () => {
  it("returns user with hot wallet and policies", async () => {
    const user = await prisma.user.create({ data: { walletAddress: "0xUser1" } });
    await prisma.hotWallet.create({
      data: { userId: user.id, address: "0xHW", encryptedPrivateKey: "enc" },
    });
    await prisma.endpointPolicy.create({
      data: { userId: user.id, endpointPattern: "https://a.com", status: "active" },
    });

    const result = await getUserWithWalletAndPolicies(user.id);
    expect(result).not.toBeNull();
    expect(result!.hotWallet).not.toBeNull();
    expect(result!.endpointPolicies).toHaveLength(1);
  });

  it("returns null for non-existent user", async () => {
    const result = await getUserWithWalletAndPolicies("nonexistent");
    expect(result).toBeNull();
  });
});
