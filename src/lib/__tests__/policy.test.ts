import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "../db";
import { resetTestDb, seedTestUser } from "../../test/helpers/db";
import { createTestPolicy, createTestTransaction } from "../../test/helpers/fixtures";
import { checkPolicy } from "../policy";

describe("checkPolicy", () => {
  let userId: string;

  beforeEach(async () => {
    await resetTestDb();
    const { user } = await seedTestUser();
    userId = user.id;
  });

  afterEach(async () => {
    vi.useRealTimers();
    await resetTestDb();
  });

  it("allows amount under all limits", async () => {
    const result = await checkPolicy(0.05, "https://api.example.com/resource", userId);

    expect(result.allowed).toBe(true);
    expect(result.perRequestLimit).toBe(0.1);
    expect(result.wcApprovalLimit).toBe(5.0);
  });

  it("rejects when no spending policy exists", async () => {
    // Create a user with no policy
    const noPolicy = await prisma.user.create({
      data: { id: "00000000-0000-4000-a000-000000000098", email: "no-policy@example.com" },
    });

    const result = await checkPolicy(0.01, "https://api.example.com/resource", noPolicy.id);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("No spending policy");
  });

  it("rejects when amount exceeds WC approval limit", async () => {
    // Default wcApprovalLimit is 5.0
    const result = await checkPolicy(6.0, "https://api.example.com/resource", userId);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("exceeds maximum approval limit");
  });

  describe("per-hour rolling window", () => {
    it("rejects when hourly spend would exceed limit", async () => {
      vi.useFakeTimers();
      const now = new Date("2025-06-01T12:00:00Z");
      vi.setSystemTime(now);

      // Default perHourLimit is 1.0, seed transactions totaling 0.95
      await prisma.transaction.create({
        data: createTestTransaction(userId, {
          id: "tx-hour-1",
          amount: 0.5,
          status: "completed",
        }),
      });
      await prisma.transaction.create({
        data: createTestTransaction(userId, {
          id: "tx-hour-2",
          amount: 0.45,
          status: "completed",
        }),
      });

      // 0.95 + 0.1 = 1.05 > 1.0
      const result = await checkPolicy(0.1, "https://api.example.com/resource", userId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Hourly spend");
    });

    it("allows when old transactions fall outside the hour window", async () => {
      vi.useFakeTimers();
      const now = new Date("2025-06-01T12:00:00Z");
      vi.setSystemTime(now);

      // Create a transaction from 2 hours ago — outside hourly window
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      await prisma.transaction.create({
        data: {
          ...createTestTransaction(userId, {
            id: "tx-old",
            amount: 0.9,
            status: "completed",
          }),
          createdAt: twoHoursAgo,
        },
      });

      const result = await checkPolicy(0.05, "https://api.example.com/resource", userId);

      expect(result.allowed).toBe(true);
    });
  });

  describe("per-day rolling window", () => {
    it("rejects when daily spend would exceed limit", async () => {
      vi.useFakeTimers();
      const now = new Date("2025-06-01T12:00:00Z");
      vi.setSystemTime(now);

      // Raise hourly limit so only the daily check triggers
      await prisma.spendingPolicy.update({
        where: { userId },
        data: { perHourLimit: 5.0 },
      });

      // Create 9 transactions (total 9.0 USDC) spread across 2-10 hours ago
      for (let i = 0; i < 9; i++) {
        const hoursAgo = new Date(now.getTime() - (i + 2) * 60 * 60 * 1000);
        await prisma.transaction.create({
          data: {
            ...createTestTransaction(userId, {
              id: `tx-day-${i}`,
              amount: 1.0,
              status: "completed",
            }),
            createdAt: hoursAgo,
          },
        });
      }

      // Daily total 9.0 + 1.5 = 10.5 > 10.0 (daily limit)
      // Hourly: 0 + 1.5 = 1.5 ≤ 5.0 (hourly limit) — passes
      const result = await checkPolicy(1.5, "https://api.example.com/resource", userId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Daily spend");
    });

    it("allows when old transactions fall outside the day window", async () => {
      vi.useFakeTimers();
      const now = new Date("2025-06-01T12:00:00Z");
      vi.setSystemTime(now);

      // Transaction from 25 hours ago — outside daily window
      const overADay = new Date(now.getTime() - 25 * 60 * 60 * 1000);
      await prisma.transaction.create({
        data: {
          ...createTestTransaction(userId, {
            id: "tx-old-day",
            amount: 9.0,
            status: "completed",
          }),
          createdAt: overADay,
        },
      });

      const result = await checkPolicy(0.05, "https://api.example.com/resource", userId);

      expect(result.allowed).toBe(true);
    });
  });

  describe("pending_approval (between per-request and WC limit)", () => {
    it("returns allowed=true with perRequestLimit for amounts above per-request but within WC limit", async () => {
      // Default: perRequestLimit=0.1, wcApprovalLimit=5.0
      // Amount 0.5 is above perRequestLimit but under wcApprovalLimit
      const result = await checkPolicy(0.5, "https://api.example.com/resource", userId);

      // checkPolicy itself allows the payment — the calling code in payment.ts
      // determines the signing strategy based on perRequestLimit
      expect(result.allowed).toBe(true);
      expect(result.perRequestLimit).toBe(0.1);
      expect(result.wcApprovalLimit).toBe(5.0);
    });
  });

  describe("whitelist", () => {
    it("allows whitelisted endpoints regardless of other checks", async () => {
      // Update policy with a whitelist
      await prisma.spendingPolicy.update({
        where: { userId },
        data: {
          whitelistedEndpoints: JSON.stringify(["https://trusted.example.com"]),
        },
      });

      const result = await checkPolicy(
        0.05,
        "https://trusted.example.com/api/resource",
        userId,
      );

      expect(result.allowed).toBe(true);
    });

    it("rejects non-whitelisted endpoints when whitelist is set", async () => {
      await prisma.spendingPolicy.update({
        where: { userId },
        data: {
          whitelistedEndpoints: JSON.stringify(["https://trusted.example.com"]),
        },
      });

      const result = await checkPolicy(
        0.05,
        "https://untrusted.example.com/api/resource",
        userId,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not in the whitelist");
    });
  });

  describe("blacklist", () => {
    it("rejects blacklisted endpoints regardless of amount", async () => {
      await prisma.spendingPolicy.update({
        where: { userId },
        data: {
          blacklistedEndpoints: JSON.stringify(["https://blocked.example.com"]),
        },
      });

      const result = await checkPolicy(
        0.01,
        "https://blocked.example.com/api/resource",
        userId,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("blacklisted");
    });

    it("allows non-blacklisted endpoints when blacklist is set", async () => {
      await prisma.spendingPolicy.update({
        where: { userId },
        data: {
          blacklistedEndpoints: JSON.stringify(["https://blocked.example.com"]),
        },
      });

      const result = await checkPolicy(
        0.05,
        "https://api.example.com/resource",
        userId,
      );

      expect(result.allowed).toBe(true);
    });
  });

  it("excludes failed transactions from rolling window calculations", async () => {
    vi.useFakeTimers();
    const now = new Date("2025-06-01T12:00:00Z");
    vi.setSystemTime(now);

    // Create a large failed transaction — should NOT count
    await prisma.transaction.create({
      data: createTestTransaction(userId, {
        id: "tx-failed",
        amount: 0.9,
        status: "failed",
      }),
    });

    // 0.0 (failed excluded) + 0.05 = 0.05 < 1.0 hourly limit
    const result = await checkPolicy(0.05, "https://api.example.com/resource", userId);

    expect(result.allowed).toBe(true);
  });
});
