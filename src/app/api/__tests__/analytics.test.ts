import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resetTestDb, seedTestUser } from "@/test/helpers/db";
import { createTestTransaction } from "@/test/helpers/fixtures";

// Mock rate-limit to avoid interference
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue(null),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

describe("Analytics API routes", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("GET /api/analytics", () => {
    it("should return analytics with transactions", async () => {
      const { user } = await seedTestUser();

      // Create some payment transactions today
      const now = new Date();
      await prisma.transaction.create({
        data: {
          ...createTestTransaction(user.id, {
            id: "analytics-tx-1",
            amount: 0.05,
            type: "payment",
          }),
          createdAt: now,
        },
      });
      await prisma.transaction.create({
        data: {
          ...createTestTransaction(user.id, {
            id: "analytics-tx-2",
            amount: 0.10,
            type: "payment",
          }),
          createdAt: now,
        },
      });

      const { GET } = await import("@/app/api/analytics/route");

      const request = new NextRequest(
        `http://localhost/api/analytics?userId=${user.id}`,
      );

      const response = await GET(request );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.dailySpending).toBeDefined();
      expect(data.dailySpending).toHaveLength(30);
      expect(data.summary).toBeDefined();
      expect(data.summary.totalTransactions).toBe(2);
      expect(data.summary.today).toBe(0.15);
      expect(data.summary.avgPaymentSize).toBe(0.08); // (0.05 + 0.10) / 2 rounded
    });

    it("should return empty analytics for user with no transactions", async () => {
      const { user } = await seedTestUser();
      const { GET } = await import("@/app/api/analytics/route");

      const request = new NextRequest(
        `http://localhost/api/analytics?userId=${user.id}`,
      );

      const response = await GET(request );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.summary.totalTransactions).toBe(0);
      expect(data.summary.today).toBe(0);
      expect(data.summary.thisWeek).toBe(0);
      expect(data.summary.thisMonth).toBe(0);
      expect(data.summary.avgPaymentSize).toBe(0);
      expect(data.dailySpending).toHaveLength(30);
      // All days should have 0 amount
      for (const day of data.dailySpending) {
        expect(day.amount).toBe(0);
      }
    });

    it("should only count payment-type transactions (not withdrawals)", async () => {
      const { user } = await seedTestUser();

      // Create a payment transaction
      await prisma.transaction.create({
        data: {
          ...createTestTransaction(user.id, {
            id: "payment-tx",
            amount: 0.05,
            type: "payment",
          }),
          createdAt: new Date(),
        },
      });

      // Create a withdrawal transaction (should be excluded)
      await prisma.transaction.create({
        data: {
          ...createTestTransaction(user.id, {
            id: "withdrawal-tx",
            amount: 1.0,
            type: "withdrawal",
          }),
          createdAt: new Date(),
        },
      });

      const { GET } = await import("@/app/api/analytics/route");

      const request = new NextRequest(
        `http://localhost/api/analytics?userId=${user.id}`,
      );

      const response = await GET(request );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.summary.totalTransactions).toBe(1);
      expect(data.summary.today).toBe(0.05);
    });

    it("should aggregate daily totals correctly", async () => {
      const { user } = await seedTestUser();

      // Create transactions on different days
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(12, 0, 0, 0);

      await prisma.transaction.create({
        data: {
          ...createTestTransaction(user.id, {
            id: "today-tx",
            amount: 0.10,
            type: "payment",
          }),
          createdAt: today,
        },
      });

      await prisma.transaction.create({
        data: {
          ...createTestTransaction(user.id, {
            id: "yesterday-tx",
            amount: 0.20,
            type: "payment",
          }),
          createdAt: yesterday,
        },
      });

      const { GET } = await import("@/app/api/analytics/route");

      const request = new NextRequest(
        `http://localhost/api/analytics?userId=${user.id}`,
      );

      const response = await GET(request );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.summary.totalTransactions).toBe(2);

      // Check that the daily spending contains entries for both days
      const todayKey = today.toISOString().split("T")[0];
      const yesterdayKey = yesterday.toISOString().split("T")[0];
      const todayEntry = data.dailySpending.find(
        (d: { date: string }) => d.date === todayKey,
      );
      const yesterdayEntry = data.dailySpending.find(
        (d: { date: string }) => d.date === yesterdayKey,
      );

      expect(todayEntry?.amount).toBe(0.1);
      expect(yesterdayEntry?.amount).toBe(0.2);
    });

    it("should return 400 when userId is missing", async () => {
      const { GET } = await import("@/app/api/analytics/route");

      const request = new NextRequest("http://localhost/api/analytics");

      const response = await GET(request );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("userId is required");
    });
  });
});
