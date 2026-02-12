import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resetTestDb, seedTestUser } from "@/test/helpers/db";
import {
  createTestTransaction,
  TEST_USER_ID,
} from "@/test/helpers/fixtures";
import { getAuthenticatedUser } from "@/lib/auth";

// Mock auth
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn().mockResolvedValue({ userId: "00000000-0000-4000-a000-000000000001" }),
}));

// Mock rate-limit to avoid interference
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue(null),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

// Mock viem for the verify route (publicClient)
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        blockNumber: BigInt(1000),
      }),
      getBlockNumber: vi.fn().mockResolvedValue(BigInt(1010)),
    })),
  };
});

describe("Transactions API routes", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ userId: TEST_USER_ID });
  });

  describe("GET /api/transactions", () => {
    it("should return transactions for the authenticated user", async () => {
      const { user } = await seedTestUser();
      await prisma.transaction.create({
        data: createTestTransaction(user.id, { id: "tx-1" }),
      });
      await prisma.transaction.create({
        data: createTestTransaction(user.id, {
          id: "tx-2",
          amount: 0.1,
          endpoint: "https://api.example.com/other",
        }),
      });

      const { GET } = await import("@/app/api/transactions/route");

      const request = new NextRequest("http://localhost/api/transactions");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
    });

    it("should return empty list for user with no transactions", async () => {
      await seedTestUser();
      const { GET } = await import("@/app/api/transactions/route");

      const request = new NextRequest("http://localhost/api/transactions");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
    });

    it("should filter by date range with since param", async () => {
      const { user } = await seedTestUser();

      // Create an older transaction
      const oldDate = new Date("2025-01-01T00:00:00Z");
      await prisma.transaction.create({
        data: {
          ...createTestTransaction(user.id, { id: "old-tx" }),
          createdAt: oldDate,
        },
      });

      // Create a recent transaction
      await prisma.transaction.create({
        data: createTestTransaction(user.id, { id: "new-tx" }),
      });

      const { GET } = await import("@/app/api/transactions/route");

      const request = new NextRequest(
        "http://localhost/api/transactions?since=2025-06-01T00:00:00Z",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe("new-tx");
    });

    it("should filter by date range with until param", async () => {
      const { user } = await seedTestUser();

      const oldDate = new Date("2025-01-01T00:00:00Z");
      await prisma.transaction.create({
        data: {
          ...createTestTransaction(user.id, { id: "old-tx" }),
          createdAt: oldDate,
        },
      });

      await prisma.transaction.create({
        data: createTestTransaction(user.id, { id: "new-tx" }),
      });

      const { GET } = await import("@/app/api/transactions/route");

      const request = new NextRequest(
        "http://localhost/api/transactions?until=2025-06-01T00:00:00Z",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe("old-tx");
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
      const { GET } = await import("@/app/api/transactions/route");

      const request = new NextRequest("http://localhost/api/transactions");

      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it("should return 400 for invalid since date format", async () => {
      const { GET } = await import("@/app/api/transactions/route");

      const request = new NextRequest(
        "http://localhost/api/transactions?since=not-a-date",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid 'since' date format");
    });

    it("should return 400 for invalid until date format", async () => {
      const { GET } = await import("@/app/api/transactions/route");

      const request = new NextRequest(
        "http://localhost/api/transactions?until=not-a-date",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid 'until' date format");
    });
  });

  describe("POST /api/transactions/[id]/verify", () => {
    it("should verify a transaction on-chain", async () => {
      const { user } = await seedTestUser();
      const txHash = "0x" + "a".repeat(64);
      await prisma.transaction.create({
        data: createTestTransaction(user.id, { id: "verify-tx", txHash }),
      });

      const { POST } = await import(
        "@/app/api/transactions/[id]/verify/route"
      );

      const request = new NextRequest(
        "http://localhost/api/transactions/verify-tx/verify",
        { method: "POST" },
      );

      const response = await POST(request as any, {
        params: Promise.resolve({ id: "verify-tx" }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.verified).toBe(true);
      expect(data.blockNumber).toBe(1000);
      expect(data.confirmations).toBe(10);
      expect(data.status).toBe("success");
    });

    it("should return 404 for non-existent transaction", async () => {
      const { POST } = await import(
        "@/app/api/transactions/[id]/verify/route"
      );

      const request = new NextRequest(
        "http://localhost/api/transactions/nonexistent/verify",
        { method: "POST" },
      );

      const response = await POST(request as any, {
        params: Promise.resolve({ id: "nonexistent" }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Transaction not found");
    });

    it("should return 400 when transaction has no tx hash", async () => {
      const { user } = await seedTestUser();
      await prisma.transaction.create({
        data: {
          ...createTestTransaction(user.id, { id: "no-hash-tx" }),
          txHash: null,
        },
      });

      const { POST } = await import(
        "@/app/api/transactions/[id]/verify/route"
      );

      const request = new NextRequest(
        "http://localhost/api/transactions/no-hash-tx/verify",
        { method: "POST" },
      );

      const response = await POST(request as any, {
        params: Promise.resolve({ id: "no-hash-tx" }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Transaction has no on-chain hash");
    });
  });
});
