import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { getAnalytics } from "../analytics";

type PrismaMock = typeof prisma & { _stores: Record<string, unknown[]> };

beforeEach(() => {
  const mock = prisma as PrismaMock;
  for (const store of Object.values(mock._stores)) {
    (store as unknown[]).length = 0;
  }
});

describe("getAnalytics", () => {
  it("returns empty analytics when no transactions", async () => {
    const result = await getAnalytics("u1");

    expect(result.summary.today).toBe(0);
    expect(result.summary.thisWeek).toBe(0);
    expect(result.summary.thisMonth).toBe(0);
    expect(result.summary.totalTransactions).toBe(0);
    expect(result.summary.avgPaymentSize).toBe(0);
    expect(result.dailySpending).toHaveLength(30);
  });

  it("calculates summary from recent transactions", async () => {
    const now = new Date();

    // Create a transaction from today
    await prisma.transaction.create({
      data: {
        userId: "u1",
        amount: 0.5,
        endpoint: "https://api.example.com",
        network: "base",
        status: "completed",
        type: "payment",
        createdAt: now,
      },
    });

    // Create a transaction from yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    await prisma.transaction.create({
      data: {
        userId: "u1",
        amount: 1.5,
        endpoint: "https://api.example.com",
        network: "base",
        status: "completed",
        type: "payment",
        createdAt: yesterday,
      },
    });

    const result = await getAnalytics("u1");

    expect(result.summary.today).toBe(0.5);
    expect(result.summary.totalTransactions).toBe(2);
    expect(result.summary.avgPaymentSize).toBe(1);
    expect(result.dailySpending).toHaveLength(30);
  });

  it("only includes payment type transactions", async () => {
    await prisma.transaction.create({
      data: {
        userId: "u1",
        amount: 10,
        endpoint: "withdrawal:0x123",
        network: "base",
        status: "completed",
        type: "withdrawal",
        createdAt: new Date(),
      },
    });

    const result = await getAnalytics("u1");
    expect(result.summary.totalTransactions).toBe(0);
    expect(result.summary.today).toBe(0);
  });

  it("excludes other users' transactions", async () => {
    await prisma.transaction.create({
      data: {
        userId: "u2",
        amount: 5,
        endpoint: "https://a.com",
        network: "base",
        status: "completed",
        type: "payment",
        createdAt: new Date(),
      },
    });

    const result = await getAnalytics("u1");
    expect(result.summary.totalTransactions).toBe(0);
  });
});
