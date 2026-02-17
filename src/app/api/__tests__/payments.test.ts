import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resetTestDb, seedTestUser } from "@/test/helpers/db";
import { createTestPendingPayment, TEST_USER_ID } from "@/test/helpers/fixtures";
import { getAuthenticatedUser } from "@/lib/auth";

// Mock auth
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn().mockResolvedValue({ userId: "00000000-0000-4000-a000-000000000001", walletAddress: "0x123" }),
}));

// Mock rate-limit to avoid interference
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue(null),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

describe("Payments API routes", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ userId: TEST_USER_ID, walletAddress: "0x123" });
  });

  describe("GET /api/payments/pending", () => {
    it("should return pending payments for the authenticated user", async () => {
      const { user } = await seedTestUser();
      await prisma.pendingPayment.create({
        data: createTestPendingPayment(user.id, { id: "pp-1" }),
      });
      await prisma.pendingPayment.create({
        data: createTestPendingPayment(user.id, {
          id: "pp-2",
          amount: 0.1,
        }),
      });

      const { GET } = await import("@/app/api/payments/pending/route");

      const request = new NextRequest("http://localhost/api/payments/pending");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
    });

    it("should return empty list when no pending payments", async () => {
      await seedTestUser();
      const { GET } = await import("@/app/api/payments/pending/route");

      const request = new NextRequest("http://localhost/api/payments/pending");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
    });

    it("should exclude expired payments", async () => {
      const { user } = await seedTestUser();

      // Create an expired payment
      await prisma.pendingPayment.create({
        data: createTestPendingPayment(user.id, {
          id: "expired-pp",
          expiresAt: new Date(Date.now() - 60_000), // expired 1 minute ago
        }),
      });

      // Create a valid pending payment
      await prisma.pendingPayment.create({
        data: createTestPendingPayment(user.id, { id: "valid-pp" }),
      });

      const { GET } = await import("@/app/api/payments/pending/route");

      const request = new NextRequest("http://localhost/api/payments/pending");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe("valid-pp");
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
      const { GET } = await import("@/app/api/payments/pending/route");

      const request = new NextRequest("http://localhost/api/payments/pending");

      const response = await GET(request);
      expect(response.status).toBe(401);
    });
  });
});
