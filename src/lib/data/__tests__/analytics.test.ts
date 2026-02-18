import { describe, it, expect } from "vitest";
import { Transaction } from "@/lib/models/transaction";
import { User } from "@/lib/models/user";
import { getAnalytics } from "../analytics";

describe("getAnalytics", () => {
  it("returns empty analytics when no transactions", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    const result = await getAnalytics(user._id.toString());

    expect(result.summary.today).toBe(0);
    expect(result.summary.thisWeek).toBe(0);
    expect(result.summary.thisMonth).toBe(0);
    expect(result.summary.totalTransactions).toBe(0);
    expect(result.summary.avgPaymentSize).toBe(0);
    expect(result.dailySpending).toHaveLength(30);
  });

  it("calculates summary from recent transactions", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });
    const userId = user._id;
    const now = new Date();

    // Create a transaction from today
    await Transaction.create({
      userId,
      amount: 0.5,
      endpoint: "https://api.example.com",
      network: "base",
      status: "completed",
      type: "payment",
      createdAt: now,
    });

    // Create a transaction from yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    await Transaction.create({
      userId,
      amount: 1.5,
      endpoint: "https://api.example.com",
      network: "base",
      status: "completed",
      type: "payment",
      createdAt: yesterday,
    });

    const result = await getAnalytics(user._id.toString());

    expect(result.summary.today).toBe(0.5);
    expect(result.summary.totalTransactions).toBe(2);
    expect(result.summary.avgPaymentSize).toBe(1);
    expect(result.dailySpending).toHaveLength(30);
  });

  it("only includes payment type transactions", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });

    await Transaction.create({
      userId: user._id,
      amount: 10,
      endpoint: "withdrawal:0x123",
      network: "base",
      status: "completed",
      type: "withdrawal",
      createdAt: new Date(),
    });

    const result = await getAnalytics(user._id.toString());
    expect(result.summary.totalTransactions).toBe(0);
    expect(result.summary.today).toBe(0);
  });

  it("excludes other users' transactions", async () => {
    const user1 = await User.create({ walletAddress: "0xUser1", email: "u1@test.com" });
    const user2 = await User.create({ walletAddress: "0xUser2", email: "u2@test.com" });

    await Transaction.create({
      userId: user2._id,
      amount: 5,
      endpoint: "https://a.com",
      network: "base",
      status: "completed",
      type: "payment",
      createdAt: new Date(),
    });

    const result = await getAnalytics(user1._id.toString());
    expect(result.summary.totalTransactions).toBe(0);
  });
});
