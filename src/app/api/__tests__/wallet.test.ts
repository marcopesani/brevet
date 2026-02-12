import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resetTestDb, seedTestUser } from "@/test/helpers/db";
import { TEST_WALLET_ADDRESS } from "@/test/helpers/crypto";
import { TEST_USER_ID } from "@/test/helpers/fixtures";
import { getAuthenticatedUser } from "@/lib/auth";

// Mock Supabase auth
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn().mockResolvedValue({ userId: "00000000-0000-4000-a000-000000000001" }),
}));

// Mock hot-wallet module for balance and withdrawal
vi.mock("@/lib/hot-wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hot-wallet")>();
  return {
    ...actual,
    getUsdcBalance: vi.fn().mockResolvedValue("10.000000"),
    withdrawFromHotWallet: vi
      .fn()
      .mockResolvedValue({ txHash: "0x" + "f".repeat(64) }),
  };
});

// Mock rate-limit to avoid interference
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue(null),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

describe("Wallet API routes", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ userId: TEST_USER_ID });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /api/wallet/create", () => {
    it("should create a hot wallet for authenticated user", async () => {
      // Create the user first (signup would normally do this)
      await prisma.user.create({ data: { id: TEST_USER_ID, email: "test@example.com" } });

      const { POST } = await import("@/app/api/wallet/create/route");

      const request = new NextRequest("http://localhost/api/wallet/create", {
        method: "POST",
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.address).toBeDefined();
      expect(data.userId).toBe(TEST_USER_ID);
    });

    it("should return existing hot wallet (idempotent)", async () => {
      const { POST } = await import("@/app/api/wallet/create/route");

      // Seed user with hot wallet
      await seedTestUser();

      const request = new NextRequest("http://localhost/api/wallet/create", {
        method: "POST",
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.address).toBe(TEST_WALLET_ADDRESS);
      expect(data.userId).toBe(TEST_USER_ID);
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
      const { POST } = await import("@/app/api/wallet/create/route");

      const request = new NextRequest("http://localhost/api/wallet/create", {
        method: "POST",
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/wallet/balance", () => {
    it("should return USDC balance for the authenticated user", async () => {
      await seedTestUser();
      const { GET } = await import("@/app/api/wallet/balance/route");

      const request = new NextRequest("http://localhost/api/wallet/balance");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.balance).toBe("10.000000");
      expect(data.address).toBe(TEST_WALLET_ADDRESS);
    });

    it("should return 404 when user has no hot wallet", async () => {
      // Create user without hot wallet
      await prisma.user.create({ data: { id: TEST_USER_ID, email: "test@example.com" } });
      const { GET } = await import("@/app/api/wallet/balance/route");

      const request = new NextRequest("http://localhost/api/wallet/balance");

      const response = await GET(request);
      expect(response.status).toBe(404);
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
      const { GET } = await import("@/app/api/wallet/balance/route");

      const request = new NextRequest("http://localhost/api/wallet/balance");

      const response = await GET(request);
      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/wallet/withdraw", () => {
    it("should withdraw USDC successfully", async () => {
      await seedTestUser();
      const { POST } = await import("@/app/api/wallet/withdraw/route");

      const toAddress = "0x" + "1".repeat(40);
      const request = new NextRequest("http://localhost/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 1.0,
          toAddress,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.txHash).toBe("0x" + "f".repeat(64));
      expect(data.amount).toBe(1.0);
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
      const { POST } = await import("@/app/api/wallet/withdraw/route");

      const request = new NextRequest("http://localhost/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 1.0,
          toAddress: "0x" + "1".repeat(40),
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it("should return 400 for invalid amount", async () => {
      const { POST } = await import("@/app/api/wallet/withdraw/route");

      const request = new NextRequest("http://localhost/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: -1,
          toAddress: "0x" + "1".repeat(40),
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("amount must be a positive number");
    });

    it("should return 400 for invalid toAddress", async () => {
      const { POST } = await import("@/app/api/wallet/withdraw/route");

      const request = new NextRequest("http://localhost/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 1.0,
          toAddress: "not-valid",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Valid toAddress is required");
    });

    it("should return 404 when user not found", async () => {
      // Auth returns a userId that doesn't exist in DB
      vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({ userId: "00000000-0000-4000-a000-999999999999" });
      const { POST } = await import("@/app/api/wallet/withdraw/route");

      const request = new NextRequest("http://localhost/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 1.0,
          toAddress: "0x" + "1".repeat(40),
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("User or hot wallet not found");
    });
  });

  describe("GET /api/wallet/session", () => {
    it("should return connected status for existing user", async () => {
      await seedTestUser();
      const { GET } = await import("@/app/api/wallet/session/route");

      const request = new NextRequest(
        `http://localhost/api/wallet/session?userId=${TEST_WALLET_ADDRESS}`,
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("connected");
      expect(data.address).toBe(TEST_WALLET_ADDRESS);
    });

    it("should return disconnected status for non-existent user", async () => {
      const { GET } = await import("@/app/api/wallet/session/route");

      const request = new NextRequest(
        "http://localhost/api/wallet/session?userId=0xnonexistent",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("disconnected");
    });

    it("should return 400 when userId is missing", async () => {
      const { GET } = await import("@/app/api/wallet/session/route");

      const request = new NextRequest("http://localhost/api/wallet/session");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("userId query parameter is required");
    });
  });
});
