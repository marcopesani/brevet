import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resetTestDb, seedTestUser, cleanupTestDb } from "@/test/helpers/db";
import { TEST_WALLET_ADDRESS } from "@/test/helpers/crypto";

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /api/wallet/create", () => {
    it("should create a new user and hot wallet", async () => {
      const { POST } = await import("@/app/api/wallet/create/route");

      const request = new NextRequest("http://localhost/api/wallet/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: "0x" + "a".repeat(40) }),
      });

      const response = await POST(request );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.address).toBeDefined();
      expect(data.userId).toBeDefined();

      // Verify user was created in DB
      const user = await prisma.user.findFirst({
        where: { walletAddress: "0x" + "a".repeat(40) },
      });
      expect(user).not.toBeNull();
    });

    it("should return existing hot wallet for duplicate creation (idempotent)", async () => {
      const { POST } = await import("@/app/api/wallet/create/route");

      const walletAddress = "0x" + "c".repeat(40);

      // First call
      const request1 = new NextRequest("http://localhost/api/wallet/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const response1 = await POST(request1 );
      const data1 = await response1.json();
      expect(response1.status).toBe(200);

      // Second call with the same wallet address
      const request2 = new NextRequest("http://localhost/api/wallet/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const response2 = await POST(request2 );
      const data2 = await response2.json();
      expect(response2.status).toBe(200);

      // Should return the same hot wallet address and userId
      expect(data2.address).toBe(data1.address);
      expect(data2.userId).toBe(data1.userId);
    });

    it("should return 400 when walletAddress is missing", async () => {
      const { POST } = await import("@/app/api/wallet/create/route");

      const request = new NextRequest("http://localhost/api/wallet/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const response = await POST(request );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("walletAddress is required");
    });
  });

  describe("GET /api/wallet/balance", () => {
    it("should return USDC balance for a valid address", async () => {
      const { GET } = await import("@/app/api/wallet/balance/route");

      const request = new NextRequest(
        `http://localhost/api/wallet/balance?address=${TEST_WALLET_ADDRESS}`,
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.balance).toBe("10.000000");
      expect(data.address).toBe(TEST_WALLET_ADDRESS);
    });

    it("should return 400 when address is missing", async () => {
      const { GET } = await import("@/app/api/wallet/balance/route");

      const request = new NextRequest("http://localhost/api/wallet/balance");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("address query parameter is required");
    });
  });

  describe("POST /api/wallet/withdraw", () => {
    it("should withdraw USDC successfully", async () => {
      const { user } = await seedTestUser();
      const { POST } = await import("@/app/api/wallet/withdraw/route");

      const toAddress = "0x" + "1".repeat(40);
      const request = new NextRequest("http://localhost/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          amount: 1.0,
          toAddress,
        }),
      });

      const response = await POST(request );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.txHash).toBe("0x" + "f".repeat(64));
      expect(data.amount).toBe(1.0);
    });

    it("should return 400 when userId is missing", async () => {
      const { POST } = await import("@/app/api/wallet/withdraw/route");

      const request = new NextRequest("http://localhost/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 1.0,
          toAddress: "0x" + "1".repeat(40),
        }),
      });

      const response = await POST(request );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("userId is required");
    });

    it("should return 400 for invalid amount", async () => {
      const { POST } = await import("@/app/api/wallet/withdraw/route");

      const request = new NextRequest("http://localhost/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "test-user-1",
          amount: -1,
          toAddress: "0x" + "1".repeat(40),
        }),
      });

      const response = await POST(request );
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
          userId: "test-user-1",
          amount: 1.0,
          toAddress: "not-valid",
        }),
      });

      const response = await POST(request );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Valid toAddress is required");
    });

    it("should return 404 when user not found", async () => {
      const { POST } = await import("@/app/api/wallet/withdraw/route");

      const request = new NextRequest("http://localhost/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "nonexistent-user",
          amount: 1.0,
          toAddress: "0x" + "1".repeat(40),
        }),
      });

      const response = await POST(request );
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
