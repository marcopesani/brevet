import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetTestDb } from "@/test/helpers/db";

// Mock Supabase server client
const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
    },
  }),
}));

// Mock hot-wallet for signup route (creates wallet on signup)
vi.mock("@/lib/hot-wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hot-wallet")>();
  return {
    ...actual,
    createHotWallet: vi.fn().mockReturnValue({
      address: "0x" + "a".repeat(40),
      encryptedPrivateKey: "test-encrypted-key",
    }),
  };
});

describe("Auth API routes", () => {
  beforeEach(async () => {
    await resetTestDb();
    mockSignUp.mockReset();
    mockSignInWithPassword.mockReset();
    mockSignOut.mockReset();
  });

  describe("POST /api/auth/signup", () => {
    it("should create a new user with email and password", async () => {
      const userId = "00000000-0000-4000-a000-000000000099";
      mockSignUp.mockResolvedValue({
        data: {
          user: { id: userId, email: "new@example.com" },
        },
        error: null,
      });

      const { POST } = await import("@/app/api/auth/signup/route");

      const request = new NextRequest("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "new@example.com",
          password: "password123",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user.id).toBe(userId);
      expect(data.user.email).toBe("new@example.com");
      expect(data.walletAddress).toBe("0x" + "a".repeat(40));
    });

    it("should return 400 when email is missing", async () => {
      const { POST } = await import("@/app/api/auth/signup/route");

      const request = new NextRequest("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "password123" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("required");
    });

    it("should return 400 when password is missing", async () => {
      const { POST } = await import("@/app/api/auth/signup/route");

      const request = new NextRequest("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("required");
    });

    it("should return 400 when email/password are not strings", async () => {
      const { POST } = await import("@/app/api/auth/signup/route");

      const request = new NextRequest("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: 123, password: true }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("strings");
    });

    it("should return error when Supabase signup fails", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: null },
        error: { message: "User already registered", status: 400 },
      });

      const { POST } = await import("@/app/api/auth/signup/route");

      const request = new NextRequest("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "existing@example.com",
          password: "password123",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("User already registered");
    });
  });

  describe("POST /api/auth/signin", () => {
    it("should sign in with valid credentials", async () => {
      const userId = "00000000-0000-4000-a000-000000000099";
      mockSignInWithPassword.mockResolvedValue({
        data: {
          user: { id: userId, email: "test@example.com" },
        },
        error: null,
      });

      const { POST } = await import("@/app/api/auth/signin/route");

      const request = new NextRequest("http://localhost/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "password123",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user.id).toBe(userId);
      expect(data.user.email).toBe("test@example.com");
    });

    it("should return 400 when email is missing", async () => {
      const { POST } = await import("@/app/api/auth/signin/route");

      const request = new NextRequest("http://localhost/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "password123" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("required");
    });

    it("should return error for wrong credentials", async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid login credentials", status: 401 },
      });

      const { POST } = await import("@/app/api/auth/signin/route");

      const request = new NextRequest("http://localhost/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "wrong-password",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Invalid login credentials");
    });
  });

  describe("POST /api/auth/signout", () => {
    it("should sign out successfully", async () => {
      mockSignOut.mockResolvedValue({ error: null });

      const { POST } = await import("@/app/api/auth/signout/route");

      const response = await POST();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should return error when signout fails", async () => {
      mockSignOut.mockResolvedValue({
        error: { message: "Session not found", status: 400 },
      });

      const { POST } = await import("@/app/api/auth/signout/route");

      const response = await POST();
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Session not found");
    });
  });
});
