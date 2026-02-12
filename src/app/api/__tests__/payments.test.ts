import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resetTestDb, seedTestUser } from "@/test/helpers/db";
import { createTestPendingPayment, TEST_USER_ID } from "@/test/helpers/fixtures";
import { getAuthenticatedUser } from "@/lib/auth";

// Mock Supabase auth
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn().mockResolvedValue({ userId: "00000000-0000-4000-a000-000000000001" }),
}));

// Mock rate-limit to avoid interference
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue(null),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

// Mock x402 headers
vi.mock("@/lib/x402/headers", () => ({
  buildPaymentSignatureHeader: vi.fn().mockReturnValue("mock-payment-header"),
}));

// Mock global fetch for the approve route (which makes a paid request)
const mockFetch = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }),
);
vi.stubGlobal("fetch", mockFetch);

describe("Payments API routes", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ userId: TEST_USER_ID });
    mockFetch.mockClear();
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

  describe("POST /api/payments/pending", () => {
    it("should create a new pending payment", async () => {
      await seedTestUser();
      const { POST } = await import("@/app/api/payments/pending/route");

      const request = new NextRequest("http://localhost/api/payments/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://api.example.com/resource",
          amount: 0.05,
          paymentRequirements: JSON.stringify([{ scheme: "exact" }]),
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.userId).toBe(TEST_USER_ID);
      expect(data.amount).toBe(0.05);
      expect(data.status).toBe("pending");
      expect(data.method).toBe("GET"); // default
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
      const { POST } = await import("@/app/api/payments/pending/route");

      const request = new NextRequest("http://localhost/api/payments/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://api.example.com/resource",
          amount: 0.05,
          paymentRequirements: "[]",
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it("should return 400 when required fields are missing", async () => {
      const { POST } = await import("@/app/api/payments/pending/route");

      const request = new NextRequest("http://localhost/api/payments/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("required");
    });

    it("should return 400 for invalid amount", async () => {
      const { POST } = await import("@/app/api/payments/pending/route");

      const request = new NextRequest("http://localhost/api/payments/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com",
          amount: -1,
          paymentRequirements: "[]",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("amount must be a positive number");
    });

    it("should return 400 for invalid paymentRequirements JSON", async () => {
      const { POST } = await import("@/app/api/payments/pending/route");

      const request = new NextRequest("http://localhost/api/payments/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com",
          amount: 1,
          paymentRequirements: "not-valid-json",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("valid JSON string");
    });
  });

  describe("POST /api/payments/[id]/approve", () => {
    it("should approve a pending payment and make paid request", async () => {
      const { user } = await seedTestUser();
      await prisma.pendingPayment.create({
        data: createTestPendingPayment(user.id, { id: "approve-pp" }),
      });

      const { POST } = await import("@/app/api/payments/[id]/approve/route");

      const request = new NextRequest(
        "http://localhost/api/payments/approve-pp/approve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signature: "0x" + "ab".repeat(65),
            authorization: {
              from: "0x" + "1".repeat(40),
              to: "0x" + "2".repeat(40),
              value: "50000",
              validAfter: "0",
              validBefore: String(Math.floor(Date.now() / 1000) + 3600),
              nonce: "0x" + "0".repeat(64),
            },
          }),
        },
      );

      const response = await POST(request as any, {
        params: Promise.resolve({ id: "approve-pp" }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify payment status was updated
      const payment = await prisma.pendingPayment.findUnique({
        where: { id: "approve-pp" },
      });
      expect(payment!.status).toBe("approved");

      // Verify transaction was logged
      const tx = await prisma.transaction.findFirst({
        where: { userId: user.id },
      });
      expect(tx).not.toBeNull();
      expect(tx!.status).toBe("completed");
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
      const { POST } = await import("@/app/api/payments/[id]/approve/route");

      const request = new NextRequest(
        "http://localhost/api/payments/some-id/approve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signature: "0xabc",
            authorization: {
              from: "0x1",
              to: "0x2",
              value: "0",
              validAfter: "0",
              validBefore: "0",
              nonce: "0x0",
            },
          }),
        },
      );

      const response = await POST(request as any, {
        params: Promise.resolve({ id: "some-id" }),
      });
      expect(response.status).toBe(401);
    });

    it("should return 404 for non-existent payment", async () => {
      const { POST } = await import("@/app/api/payments/[id]/approve/route");

      const request = new NextRequest(
        "http://localhost/api/payments/nonexistent/approve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signature: "0xabc",
            authorization: {
              from: "0x1",
              to: "0x2",
              value: "0",
              validAfter: "0",
              validBefore: "0",
              nonce: "0x0",
            },
          }),
        },
      );

      const response = await POST(request as any, {
        params: Promise.resolve({ id: "nonexistent" }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Pending payment not found");
    });

    it("should return 410 for expired payment", async () => {
      const { user } = await seedTestUser();
      await prisma.pendingPayment.create({
        data: createTestPendingPayment(user.id, {
          id: "expired-pp",
          expiresAt: new Date(Date.now() - 60_000),
        }),
      });

      const { POST } = await import("@/app/api/payments/[id]/approve/route");

      const request = new NextRequest(
        "http://localhost/api/payments/expired-pp/approve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signature: "0xabc",
            authorization: {
              from: "0x1",
              to: "0x2",
              value: "0",
              validAfter: "0",
              validBefore: "0",
              nonce: "0x0",
            },
          }),
        },
      );

      const response = await POST(request as any, {
        params: Promise.resolve({ id: "expired-pp" }),
      });
      const data = await response.json();

      expect(response.status).toBe(410);
      expect(data.error).toBe("Payment has expired");
    });

    it("should return 409 for already approved payment", async () => {
      const { user } = await seedTestUser();
      await prisma.pendingPayment.create({
        data: createTestPendingPayment(user.id, {
          id: "approved-pp",
          status: "approved",
        }),
      });

      const { POST } = await import("@/app/api/payments/[id]/approve/route");

      const request = new NextRequest(
        "http://localhost/api/payments/approved-pp/approve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signature: "0xabc",
            authorization: {
              from: "0x1",
              to: "0x2",
              value: "0",
              validAfter: "0",
              validBefore: "0",
              nonce: "0x0",
            },
          }),
        },
      );

      const response = await POST(request as any, {
        params: Promise.resolve({ id: "approved-pp" }),
      });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe("Payment is already approved");
    });

    it("should return 400 when signature/authorization are missing", async () => {
      const { POST } = await import("@/app/api/payments/[id]/approve/route");

      const request = new NextRequest(
        "http://localhost/api/payments/some-id/approve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      const response = await POST(request as any, {
        params: Promise.resolve({ id: "some-id" }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("required");
    });
  });

  describe("POST /api/payments/[id]/reject", () => {
    it("should reject a pending payment", async () => {
      const { user } = await seedTestUser();
      await prisma.pendingPayment.create({
        data: createTestPendingPayment(user.id, { id: "reject-pp" }),
      });

      const { POST } = await import("@/app/api/payments/[id]/reject/route");

      const request = new NextRequest(
        "http://localhost/api/payments/reject-pp/reject",
        { method: "POST" },
      );

      const response = await POST(request as any, {
        params: Promise.resolve({ id: "reject-pp" }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe("rejected");

      // Verify DB updated
      const payment = await prisma.pendingPayment.findUnique({
        where: { id: "reject-pp" },
      });
      expect(payment!.status).toBe("rejected");
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
      const { POST } = await import("@/app/api/payments/[id]/reject/route");

      const request = new NextRequest(
        "http://localhost/api/payments/some-id/reject",
        { method: "POST" },
      );

      const response = await POST(request as any, {
        params: Promise.resolve({ id: "some-id" }),
      });
      expect(response.status).toBe(401);
    });

    it("should return 404 for non-existent payment", async () => {
      const { POST } = await import("@/app/api/payments/[id]/reject/route");

      const request = new NextRequest(
        "http://localhost/api/payments/nonexistent/reject",
        { method: "POST" },
      );

      const response = await POST(request as any, {
        params: Promise.resolve({ id: "nonexistent" }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Pending payment not found");
    });

    it("should return 409 for already rejected payment", async () => {
      const { user } = await seedTestUser();
      await prisma.pendingPayment.create({
        data: createTestPendingPayment(user.id, {
          id: "already-rejected-pp",
          status: "rejected",
        }),
      });

      const { POST } = await import("@/app/api/payments/[id]/reject/route");

      const request = new NextRequest(
        "http://localhost/api/payments/already-rejected-pp/reject",
        { method: "POST" },
      );

      const response = await POST(request as any, {
        params: Promise.resolve({ id: "already-rejected-pp" }),
      });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe("Payment is already rejected");
    });
  });
});
