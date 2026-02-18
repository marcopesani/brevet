import { describe, it, expect } from "vitest";
import { Transaction } from "@/lib/models/transaction";
import { Types } from "mongoose";
import {
  getRecentTransactions,
  getTransactions,
  getSpendingHistory,
  createTransaction,
} from "../transactions";

const uid = () => new Types.ObjectId().toString();

describe("getRecentTransactions", () => {
  it("returns limited transactions ordered by createdAt desc", async () => {
    const userId = uid();
    for (let i = 0; i < 10; i++) {
      await Transaction.create({
        userId: new Types.ObjectId(userId),
        amount: i,
        endpoint: `https://api.example.com/${i}`,
        network: "base",
        status: "completed",
        createdAt: new Date(Date.now() - (10 - i) * 1000),
      });
    }

    const result = await getRecentTransactions(userId, 3);
    expect(result).toHaveLength(3);
    // Most recent first
    expect(result[0].amount).toBe(9);
  });

  it("defaults to 5 when no limit provided", async () => {
    const userId = uid();
    for (let i = 0; i < 10; i++) {
      await Transaction.create({
        userId: new Types.ObjectId(userId),
        amount: i,
        endpoint: "https://a.com",
        network: "base",
        status: "completed",
      });
    }

    const result = await getRecentTransactions(userId);
    expect(result).toHaveLength(5);
  });
});

describe("getTransactions", () => {
  it("returns all transactions for a user", async () => {
    const userId = uid();
    const otherUser = uid();
    await Transaction.create({ userId: new Types.ObjectId(userId), amount: 1, endpoint: "https://a.com", network: "base", status: "completed" });
    await Transaction.create({ userId: new Types.ObjectId(otherUser), amount: 2, endpoint: "https://b.com", network: "base", status: "completed" });

    const result = await getTransactions(userId);
    expect(result).toHaveLength(1);
  });

  it("filters by date range", async () => {
    const userId = uid();
    const now = new Date();
    const old = new Date(now.getTime() - 100_000);
    const recent = new Date(now.getTime() - 10_000);

    await Transaction.create({ userId: new Types.ObjectId(userId), amount: 1, endpoint: "https://a.com", network: "base", status: "completed", createdAt: old });
    await Transaction.create({ userId: new Types.ObjectId(userId), amount: 2, endpoint: "https://b.com", network: "base", status: "completed", createdAt: recent });

    const result = await getTransactions(userId, { since: new Date(now.getTime() - 50_000) });
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(2);
  });
});

describe("getSpendingHistory", () => {
  it("returns up to 100 transactions", async () => {
    const userId = uid();
    for (let i = 0; i < 5; i++) {
      await Transaction.create({ userId: new Types.ObjectId(userId), amount: i, endpoint: "https://a.com", network: "base", status: "completed" });
    }

    const result = await getSpendingHistory(userId);
    expect(result).toHaveLength(5);
  });

  it("filters by since date", async () => {
    const userId = uid();
    const old = new Date(Date.now() - 100_000);
    const recent = new Date(Date.now() - 1_000);

    await Transaction.create({ userId: new Types.ObjectId(userId), amount: 1, endpoint: "https://a.com", network: "base", status: "completed", createdAt: old });
    await Transaction.create({ userId: new Types.ObjectId(userId), amount: 2, endpoint: "https://b.com", network: "base", status: "completed", createdAt: recent });

    const result = await getSpendingHistory(userId, { since: new Date(Date.now() - 50_000) });
    expect(result).toHaveLength(1);
  });
});

describe("createTransaction", () => {
  it("creates a transaction with all fields", async () => {
    const userId = uid();
    const tx = await createTransaction({
      amount: 0.01,
      endpoint: "https://api.example.com",
      txHash: "0xabc",
      network: "base",
      status: "completed",
      type: "payment",
      userId,
      responsePayload: '{"data": "ok"}',
    });

    expect(tx.amount).toBe(0.01);
    expect(tx.txHash).toBe("0xabc");
    expect(tx.type).toBe("payment");
    expect(tx.responsePayload).toBe('{"data": "ok"}');
  });

  it("defaults type to payment", async () => {
    const userId = uid();
    const tx = await createTransaction({
      amount: 1,
      endpoint: "https://a.com",
      network: "base",
      status: "completed",
      userId,
    });

    expect(tx.type).toBe("payment");
  });

  it("stores errorMessage and responseStatus when provided", async () => {
    const userId = uid();
    const tx = await createTransaction({
      amount: 0.05,
      endpoint: "https://api.example.com/resource",
      network: "base",
      status: "failed",
      userId,
      errorMessage: "Payment submitted but server responded with 500",
      responseStatus: 500,
    });

    expect(tx.errorMessage).toBe("Payment submitted but server responded with 500");
    expect(tx.responseStatus).toBe(500);
    expect(tx.status).toBe("failed");
  });

  it("defaults error fields to null when not provided", async () => {
    const userId = uid();
    const tx = await createTransaction({
      amount: 0.01,
      endpoint: "https://api.example.com",
      txHash: "0xdef",
      network: "base",
      status: "completed",
      userId,
    });

    expect(tx.errorMessage).toBeNull();
    expect(tx.responseStatus).toBeNull();
    expect(tx.status).toBe("completed");
  });
});

describe("getTransactions returns error fields", () => {
  it("returns records with errorMessage and responseStatus", async () => {
    const userId = uid();
    await Transaction.create({
      userId: new Types.ObjectId(userId),
      amount: 0.05,
      endpoint: "https://api.example.com",
      network: "base",
      status: "failed",
      errorMessage: "Server error",
      responseStatus: 503,
    });

    const result = await getTransactions(userId);
    expect(result).toHaveLength(1);
    expect(result[0].errorMessage).toBe("Server error");
    expect(result[0].responseStatus).toBe(503);
  });
});

describe("chainId filtering", () => {
  it("getTransactions filters by chainId", async () => {
    const userId = uid();
    await Transaction.create({ userId: new Types.ObjectId(userId), amount: 1, endpoint: "https://a.com", network: "base", status: "completed", chainId: 8453 });
    await Transaction.create({ userId: new Types.ObjectId(userId), amount: 2, endpoint: "https://b.com", network: "arbitrum", status: "completed", chainId: 42161 });

    const baseOnly = await getTransactions(userId, { chainId: 8453 });
    expect(baseOnly).toHaveLength(1);
    expect(baseOnly[0].amount).toBe(1);

    const arbOnly = await getTransactions(userId, { chainId: 42161 });
    expect(arbOnly).toHaveLength(1);
    expect(arbOnly[0].amount).toBe(2);

    const all = await getTransactions(userId);
    expect(all).toHaveLength(2);
  });

  it("getRecentTransactions filters by chainId", async () => {
    const userId = uid();
    await Transaction.create({ userId: new Types.ObjectId(userId), amount: 1, endpoint: "https://a.com", network: "base", status: "completed", chainId: 8453 });
    await Transaction.create({ userId: new Types.ObjectId(userId), amount: 2, endpoint: "https://b.com", network: "arbitrum", status: "completed", chainId: 42161 });

    const baseOnly = await getRecentTransactions(userId, 10, { chainId: 8453 });
    expect(baseOnly).toHaveLength(1);
    expect(baseOnly[0].amount).toBe(1);
  });

  it("getSpendingHistory filters by chainId", async () => {
    const userId = uid();
    await Transaction.create({ userId: new Types.ObjectId(userId), amount: 1, endpoint: "https://a.com", network: "base", status: "completed", chainId: 8453 });
    await Transaction.create({ userId: new Types.ObjectId(userId), amount: 2, endpoint: "https://b.com", network: "arbitrum", status: "completed", chainId: 42161 });

    const baseOnly = await getSpendingHistory(userId, { chainId: 8453 });
    expect(baseOnly).toHaveLength(1);
    expect(baseOnly[0].amount).toBe(1);
  });

  it("createTransaction stores chainId when provided", async () => {
    const userId = uid();
    const tx = await createTransaction({
      amount: 0.5,
      endpoint: "https://api.example.com",
      network: "arbitrum",
      chainId: 42161,
      status: "completed",
      userId,
    });

    expect(tx.chainId).toBe(42161);
  });

  it("createTransaction defaults chainId from env when not provided", async () => {
    const userId = uid();
    const tx = await createTransaction({
      amount: 0.5,
      endpoint: "https://api.example.com",
      network: "base",
      status: "completed",
      userId,
    });

    // Default chainId from NEXT_PUBLIC_CHAIN_ID env var (8453 in test)
    expect(tx.chainId).toBeDefined();
    expect(typeof tx.chainId).toBe("number");
  });
});
