import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  getRecentTransactions,
  getTransactions,
  getSpendingHistory,
  createTransaction,
} from "../transactions";

type PrismaMock = typeof prisma & { _stores: Record<string, unknown[]> };

beforeEach(() => {
  const mock = prisma as PrismaMock;
  for (const store of Object.values(mock._stores)) {
    (store as unknown[]).length = 0;
  }
});

describe("getRecentTransactions", () => {
  it("returns limited transactions ordered by createdAt desc", async () => {
    for (let i = 0; i < 10; i++) {
      await prisma.transaction.create({
        data: {
          userId: "u1",
          amount: i,
          endpoint: `https://api.example.com/${i}`,
          network: "base",
          status: "completed",
          createdAt: new Date(Date.now() - (10 - i) * 1000),
        },
      });
    }

    const result = await getRecentTransactions("u1", 3);
    expect(result).toHaveLength(3);
    // Most recent first
    expect(result[0].amount).toBe(9);
  });

  it("defaults to 5 when no limit provided", async () => {
    for (let i = 0; i < 10; i++) {
      await prisma.transaction.create({
        data: { userId: "u1", amount: i, endpoint: "https://a.com", network: "base", status: "completed" },
      });
    }

    const result = await getRecentTransactions("u1");
    expect(result).toHaveLength(5);
  });
});

describe("getTransactions", () => {
  it("returns all transactions for a user", async () => {
    await prisma.transaction.create({
      data: { userId: "u1", amount: 1, endpoint: "https://a.com", network: "base", status: "completed" },
    });
    await prisma.transaction.create({
      data: { userId: "u2", amount: 2, endpoint: "https://b.com", network: "base", status: "completed" },
    });

    const result = await getTransactions("u1");
    expect(result).toHaveLength(1);
  });

  it("filters by date range", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 100_000);
    const recent = new Date(now.getTime() - 10_000);

    await prisma.transaction.create({
      data: { userId: "u1", amount: 1, endpoint: "https://a.com", network: "base", status: "completed", createdAt: old },
    });
    await prisma.transaction.create({
      data: { userId: "u1", amount: 2, endpoint: "https://b.com", network: "base", status: "completed", createdAt: recent },
    });

    const result = await getTransactions("u1", { since: new Date(now.getTime() - 50_000) });
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(2);
  });
});

describe("getSpendingHistory", () => {
  it("returns up to 100 transactions", async () => {
    for (let i = 0; i < 5; i++) {
      await prisma.transaction.create({
        data: { userId: "u1", amount: i, endpoint: "https://a.com", network: "base", status: "completed" },
      });
    }

    const result = await getSpendingHistory("u1");
    expect(result).toHaveLength(5);
  });

  it("filters by since date", async () => {
    const old = new Date(Date.now() - 100_000);
    const recent = new Date(Date.now() - 1_000);

    await prisma.transaction.create({
      data: { userId: "u1", amount: 1, endpoint: "https://a.com", network: "base", status: "completed", createdAt: old },
    });
    await prisma.transaction.create({
      data: { userId: "u1", amount: 2, endpoint: "https://b.com", network: "base", status: "completed", createdAt: recent },
    });

    const result = await getSpendingHistory("u1", { since: new Date(Date.now() - 50_000) });
    expect(result).toHaveLength(1);
  });
});

describe("createTransaction", () => {
  it("creates a transaction with all fields", async () => {
    const tx = await createTransaction({
      amount: 0.01,
      endpoint: "https://api.example.com",
      txHash: "0xabc",
      network: "base",
      status: "completed",
      type: "payment",
      userId: "u1",
      responsePayload: '{"data": "ok"}',
    });

    expect(tx.amount).toBe(0.01);
    expect(tx.txHash).toBe("0xabc");
    expect(tx.type).toBe("payment");
    expect(tx.responsePayload).toBe('{"data": "ok"}');
  });

  it("defaults type to payment", async () => {
    const tx = await createTransaction({
      amount: 1,
      endpoint: "https://a.com",
      network: "base",
      status: "completed",
      userId: "u1",
    });

    expect(tx.type).toBe("payment");
  });

  it("stores errorMessage and responseStatus when provided", async () => {
    const tx = await createTransaction({
      amount: 0.05,
      endpoint: "https://api.example.com/resource",
      network: "base",
      status: "failed",
      userId: "u1",
      errorMessage: "Payment submitted but server responded with 500",
      responseStatus: 500,
    });

    expect(tx.errorMessage).toBe("Payment submitted but server responded with 500");
    expect(tx.responseStatus).toBe(500);
    expect(tx.status).toBe("failed");
  });

  it("works without error fields (backward compatible)", async () => {
    const tx = await createTransaction({
      amount: 0.01,
      endpoint: "https://api.example.com",
      txHash: "0xdef",
      network: "base",
      status: "completed",
      userId: "u1",
    });

    expect(tx.errorMessage).toBeUndefined();
    expect(tx.responseStatus).toBeUndefined();
    expect(tx.status).toBe("completed");
  });
});

describe("getTransactions returns error fields", () => {
  it("returns records with errorMessage and responseStatus", async () => {
    await prisma.transaction.create({
      data: {
        userId: "u1",
        amount: 0.05,
        endpoint: "https://api.example.com",
        network: "base",
        status: "failed",
        errorMessage: "Server error",
        responseStatus: 503,
      },
    });

    const result = await getTransactions("u1");
    expect(result).toHaveLength(1);
    expect(result[0].errorMessage).toBe("Server error");
    expect(result[0].responseStatus).toBe(503);
  });
});
