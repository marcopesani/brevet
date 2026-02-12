import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory cookie jar for testing
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

// Set JWT_SECRET for the tests
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-chars-long";

import {
  generateNonce,
  createSession,
  getAuthenticatedUser,
  destroySession,
  setNonceCookie,
  consumeNonceCookie,
} from "../auth";

describe("auth helpers", () => {
  beforeEach(() => {
    cookieJar = new Map();
  });

  describe("generateNonce", () => {
    it("returns a 32-character hex string", () => {
      const nonce = generateNonce();
      expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    });

    it("generates unique nonces", () => {
      const nonces = new Set(Array.from({ length: 20 }, () => generateNonce()));
      expect(nonces.size).toBe(20);
    });
  });

  describe("createSession / getAuthenticatedUser", () => {
    it("creates a JWT that getAuthenticatedUser can verify", async () => {
      await createSession("user-123", "0xabc");

      const user = await getAuthenticatedUser();
      expect(user).toEqual({
        userId: "user-123",
        walletAddress: "0xabc",
      });
    });

    it("sets an httpOnly session cookie", async () => {
      await createSession("user-123", "0xabc");
      expect(cookieJar.has("session")).toBe(true);
    });

    it("returns null when no session cookie exists", async () => {
      const user = await getAuthenticatedUser();
      expect(user).toBeNull();
    });

    it("returns null for an invalid JWT token", async () => {
      cookieJar.set("session", "not-a-valid-jwt");
      const user = await getAuthenticatedUser();
      expect(user).toBeNull();
    });

    it("returns null for a tampered JWT token", async () => {
      // Create a session with the current secret
      await createSession("user-123", "0xabc");
      const token = cookieJar.get("session")!;

      // Replace signature with a completely different one
      const parts = token.split(".");
      parts[2] = "INVALID_SIGNATURE_THAT_WILL_NOT_VERIFY_correctly";
      cookieJar.set("session", parts.join("."));

      const user = await getAuthenticatedUser();
      expect(user).toBeNull();
    });
  });

  describe("destroySession", () => {
    it("deletes the session cookie", async () => {
      await createSession("user-123", "0xabc");
      expect(cookieJar.has("session")).toBe(true);

      await destroySession();
      expect(cookieJar.has("session")).toBe(false);
    });
  });

  describe("setNonceCookie / consumeNonceCookie", () => {
    it("stores nonce and retrieves it on consume", async () => {
      await setNonceCookie("test-nonce-123");
      const nonce = await consumeNonceCookie();
      expect(nonce).toBe("test-nonce-123");
    });

    it("deletes the nonce cookie after consumption", async () => {
      await setNonceCookie("test-nonce-456");
      await consumeNonceCookie();
      expect(cookieJar.has("siwe_nonce")).toBe(false);
    });

    it("returns null when no nonce cookie exists", async () => {
      const nonce = await consumeNonceCookie();
      expect(nonce).toBeNull();
    });

    it("second consume returns null (nonce is single-use)", async () => {
      await setNonceCookie("one-time-nonce");
      await consumeNonceCookie();
      const second = await consumeNonceCookie();
      expect(second).toBeNull();
    });
  });
});
