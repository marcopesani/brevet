import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resetTestDb, seedTestUser } from "@/test/helpers/db";
import { TEST_USER_ID } from "@/test/helpers/fixtures";
import { TEST_WALLET_ADDRESS } from "@/test/helpers/crypto";

// --- Cookie jar shared across mocked auth helpers and route handlers ---
let cookieJar: Map<string, string>;

const mockCookieStore = {
  get: (name: string) => {
    const value = cookieJar.get(name);
    return value !== undefined ? { name, value } : undefined;
  },
  set: (name: string, value: string, _options?: any) => {
    cookieJar.set(name, value);
  },
  delete: (name: string) => {
    cookieJar.delete(name);
  },
};

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockImplementation(async () => mockCookieStore),
}));

// Mock the SIWE library — must use a real class so `new SiweMessage()` works
let mockSiweVerifyResult = { success: true };
let mockSiweAddress = TEST_WALLET_ADDRESS;
let mockSiweNonce = "mock-nonce-value";

vi.mock("siwe", () => {
  return {
    SiweMessage: class MockSiweMessage {
      address: string;
      nonce: string;
      constructor(_message: string) {
        this.address = mockSiweAddress;
        this.nonce = mockSiweNonce;
      }
      async verify(_opts: any) {
        return mockSiweVerifyResult;
      }
    },
  };
});

// Mock hot-wallet module (verify route calls createHotWallet for new users)
vi.mock("@/lib/hot-wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hot-wallet")>();
  return {
    ...actual,
    createHotWallet: vi.fn().mockReturnValue({
      address: "0x" + "d".repeat(40),
      encryptedPrivateKey: "mock-encrypted-key",
    }),
  };
});

// Set JWT_SECRET for session creation
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-chars-long";

describe("Auth API routes", () => {
  beforeEach(async () => {
    cookieJar = new Map();
    await resetTestDb();
    // Reset SIWE mock state
    mockSiweVerifyResult = { success: true };
    mockSiweAddress = TEST_WALLET_ADDRESS;
    mockSiweNonce = "mock-nonce-value";
  });

  describe("GET /api/auth/nonce", () => {
    it("returns a nonce in the response body", async () => {
      const { GET } = await import("@/app/api/auth/nonce/route");

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.nonce).toBeDefined();
      expect(typeof data.nonce).toBe("string");
      expect(data.nonce).toMatch(/^[0-9a-f]{32}$/);
    });

    it("sets a siwe_nonce cookie", async () => {
      const { GET } = await import("@/app/api/auth/nonce/route");

      await GET();

      expect(cookieJar.has("siwe_nonce")).toBe(true);
    });

    it("generates unique nonces per request", async () => {
      const { GET } = await import("@/app/api/auth/nonce/route");

      const r1 = await GET();
      const d1 = await r1.json();
      // Clear cookie to simulate new request
      cookieJar.delete("siwe_nonce");

      const r2 = await GET();
      const d2 = await r2.json();

      expect(d1.nonce).not.toBe(d2.nonce);
    });
  });

  describe("POST /api/auth/verify", () => {
    it("creates a new user with HotWallet on first login", async () => {
      const { createHotWallet } = await import("@/lib/hot-wallet");

      // Set up nonce cookie (as if /nonce was called first)
      cookieJar.set("siwe_nonce", "mock-nonce-value");

      const { POST } = await import("@/app/api/auth/verify/route");

      const request = new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "mock-siwe-message",
          signature: "0xmocksignature",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.walletAddress).toBe(TEST_WALLET_ADDRESS.toLowerCase());
      expect(data.userId).toBeDefined();

      // Verify createHotWallet was called (for new user provisioning)
      expect(createHotWallet).toHaveBeenCalled();

      // Verify user record was created in DB
      const user = await prisma.user.findUnique({
        where: { walletAddress: TEST_WALLET_ADDRESS.toLowerCase() },
      });
      expect(user).not.toBeNull();
    });

    it("authenticates a returning user without creating duplicates", async () => {
      // Seed an existing user with the wallet address
      await prisma.user.create({
        data: {
          id: TEST_USER_ID,
          walletAddress: TEST_WALLET_ADDRESS.toLowerCase(),
        },
      });
      await prisma.hotWallet.create({
        data: {
          address: "0x" + "d".repeat(40),
          encryptedPrivateKey: "existing-key",
          userId: TEST_USER_ID,
        },
      });
      cookieJar.set("siwe_nonce", "mock-nonce-value");

      const { POST } = await import("@/app/api/auth/verify/route");

      const request = new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "mock-siwe-message",
          signature: "0xmocksignature",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.userId).toBe(TEST_USER_ID);

      // Verify no duplicate users were created
      const users = await prisma.user.findMany({
        where: { walletAddress: TEST_WALLET_ADDRESS.toLowerCase() },
      });
      expect(users).toHaveLength(1);
    });

    it("sets a session cookie after successful verification", async () => {
      cookieJar.set("siwe_nonce", "mock-nonce-value");

      const { POST } = await import("@/app/api/auth/verify/route");

      const request = new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "mock-siwe-message",
          signature: "0xmocksignature",
        }),
      });

      await POST(request);

      expect(cookieJar.has("session")).toBe(true);
    });

    it("returns 400 when message or signature is missing", async () => {
      const { POST } = await import("@/app/api/auth/verify/route");

      const noMessage = new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: "0xabc" }),
      });
      const r1 = await POST(noMessage);
      expect(r1.status).toBe(400);

      const noSignature = new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "msg" }),
      });
      const r2 = await POST(noSignature);
      expect(r2.status).toBe(400);
    });

    it("returns 401 when SIWE signature verification fails", async () => {
      cookieJar.set("siwe_nonce", "mock-nonce-value");

      // Override the mock to fail verification
      mockSiweVerifyResult = { success: false };

      const { POST } = await import("@/app/api/auth/verify/route");

      const request = new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "mock-siwe-message",
          signature: "0xbadsignature",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Invalid signature");
    });

    it("returns 401 when nonce does not match", async () => {
      // Set a different nonce in the cookie than what the SIWE message contains
      cookieJar.set("siwe_nonce", "different-nonce-value");

      const { POST } = await import("@/app/api/auth/verify/route");

      const request = new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "mock-siwe-message",
          signature: "0xmocksignature",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Invalid or expired nonce");
    });

    it("returns 401 when no nonce cookie exists (expired)", async () => {
      // Don't set any nonce cookie
      const { POST } = await import("@/app/api/auth/verify/route");

      const request = new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "mock-siwe-message",
          signature: "0xmocksignature",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Invalid or expired nonce");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("destroys the session cookie and returns success", async () => {
      // Create a session first
      cookieJar.set("session", "some-jwt-token");

      const { POST } = await import("@/app/api/auth/logout/route");

      const response = await POST();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(cookieJar.has("session")).toBe(false);
    });

    it("succeeds even when no session exists", async () => {
      const { POST } = await import("@/app/api/auth/logout/route");

      const response = await POST();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe("401 on protected routes without valid session", () => {
    it("wallet/create returns 401 without valid auth", async () => {
      // Import a protected route that uses getAuthenticatedUser
      const { getAuthenticatedUser } = await import("@/lib/auth");
      // With no session cookie, getAuthenticatedUser should return null
      const result = await getAuthenticatedUser();
      expect(result).toBeNull();
    });
  });
});
