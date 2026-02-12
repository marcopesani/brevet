import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resetTestDb, seedTestUser } from "@/test/helpers/db";
import { TEST_USER_ID } from "@/test/helpers/fixtures";
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

describe("Policy API routes", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ userId: TEST_USER_ID });
  });

  describe("GET /api/policy", () => {
    it("should return spending policy for authenticated user", async () => {
      const { policy } = await seedTestUser();
      const { GET } = await import("@/app/api/policy/route");

      const request = new NextRequest("http://localhost/api/policy");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBe(policy.id);
      expect(data.perRequestLimit).toBe(0.1);
      expect(data.perHourLimit).toBe(1.0);
      expect(data.perDayLimit).toBe(10.0);
      expect(data.whitelistedEndpoints).toEqual([]);
      expect(data.blacklistedEndpoints).toEqual([]);
    });

    it("should return 404 for user without policy", async () => {
      // Create user without policy
      await prisma.user.create({ data: { id: TEST_USER_ID, email: "test@example.com" } });
      const { GET } = await import("@/app/api/policy/route");

      const request = new NextRequest("http://localhost/api/policy");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("No spending policy found");
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
      const { GET } = await import("@/app/api/policy/route");

      const request = new NextRequest("http://localhost/api/policy");

      const response = await GET(request);
      expect(response.status).toBe(401);
    });
  });

  describe("PUT /api/policy", () => {
    it("should update spending limits", async () => {
      await seedTestUser();
      const { PUT } = await import("@/app/api/policy/route");

      const request = new NextRequest("http://localhost/api/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perRequestLimit: 0.5,
          perHourLimit: 5.0,
          perDayLimit: 50.0,
        }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.perRequestLimit).toBe(0.5);
      expect(data.perHourLimit).toBe(5.0);
      expect(data.perDayLimit).toBe(50.0);
    });

    it("should update whitelist and blacklist", async () => {
      await seedTestUser();
      const { PUT } = await import("@/app/api/policy/route");

      const request = new NextRequest("http://localhost/api/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whitelistedEndpoints: ["https://api.example.com/*"],
          blacklistedEndpoints: ["https://evil.example.com/*"],
        }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.whitelistedEndpoints).toEqual([
        "https://api.example.com/*",
      ]);
      expect(data.blacklistedEndpoints).toEqual([
        "https://evil.example.com/*",
      ]);
    });

    it("should create policy via upsert for user without policy", async () => {
      // Create a user without a policy
      await prisma.user.create({
        data: { id: TEST_USER_ID, email: "test@example.com" },
      });

      const { PUT } = await import("@/app/api/policy/route");

      const request = new NextRequest("http://localhost/api/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perRequestLimit: 0.2,
        }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.perRequestLimit).toBe(0.2);
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
      const { PUT } = await import("@/app/api/policy/route");

      const request = new NextRequest("http://localhost/api/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perRequestLimit: 0.5 }),
      });

      const response = await PUT(request);
      expect(response.status).toBe(401);
    });

    it("should return 400 for negative limit values", async () => {
      await seedTestUser();
      const { PUT } = await import("@/app/api/policy/route");

      const request = new NextRequest("http://localhost/api/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perRequestLimit: -1,
        }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("must be a non-negative number");
    });

    it("should return 400 for invalid endpoint list types", async () => {
      await seedTestUser();
      const { PUT } = await import("@/app/api/policy/route");

      const request = new NextRequest("http://localhost/api/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whitelistedEndpoints: "not-an-array",
        }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("must be an array");
    });

    it("should return 400 for invalid JSON body", async () => {
      const { PUT } = await import("@/app/api/policy/route");

      const request = new NextRequest("http://localhost/api/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid JSON body");
    });
  });
});
