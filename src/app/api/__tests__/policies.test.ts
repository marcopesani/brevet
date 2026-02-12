import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { TEST_USER_ID } from "@/test/helpers/fixtures";
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

async function resetDb() {
  await prisma.pendingPayment.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.endpointPolicy.deleteMany();
  await prisma.hotWallet.deleteMany();
  await prisma.user.deleteMany();
}

async function createUser(id: string = TEST_USER_ID) {
  return prisma.user.create({
    data: { id, email: `${id}@example.com` },
  });
}

async function createPolicy(userId: string, endpointPattern: string, overrides?: Record<string, unknown>) {
  return prisma.endpointPolicy.create({
    data: { userId, endpointPattern, ...overrides },
  });
}

describe("Policies API routes", () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ userId: TEST_USER_ID, walletAddress: "0x123" });
  });

  describe("GET /api/policies", () => {
    it("should return all endpoint policies for authenticated user", async () => {
      await createUser();
      await createPolicy(TEST_USER_ID, "https://api.example.com/a");
      await createPolicy(TEST_USER_ID, "https://api.example.com/b");

      const { GET } = await import("@/app/api/policies/route");
      const request = new NextRequest("http://localhost/api/policies");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
    });

    it("should filter by status query param", async () => {
      await createUser();
      await createPolicy(TEST_USER_ID, "https://api.example.com/a", { status: "active" });
      await createPolicy(TEST_USER_ID, "https://api.example.com/b", { status: "draft" });

      const { GET } = await import("@/app/api/policies/route");
      const request = new NextRequest("http://localhost/api/policies?status=active");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0].status).toBe("active");
    });

    it("should return empty array when no policies exist", async () => {
      await createUser();

      const { GET } = await import("@/app/api/policies/route");
      const request = new NextRequest("http://localhost/api/policies");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);

      const { GET } = await import("@/app/api/policies/route");
      const request = new NextRequest("http://localhost/api/policies");
      const response = await GET(request);

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/policies", () => {
    it("should create a new endpoint policy", async () => {
      await createUser();

      const { POST } = await import("@/app/api/policies/route");
      const request = new NextRequest("http://localhost/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpointPattern: "https://api.example.com/resource",
          payFromHotWallet: true,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.endpointPattern).toBe("https://api.example.com/resource");
      expect(data.payFromHotWallet).toBe(true);
    });

    it("should return 400 when endpointPattern is missing", async () => {
      const { POST } = await import("@/app/api/policies/route");
      const request = new NextRequest("http://localhost/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payFromHotWallet: true }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("endpointPattern is required");
    });

    it("should return 400 for invalid status", async () => {
      await createUser();

      const { POST } = await import("@/app/api/policies/route");
      const request = new NextRequest("http://localhost/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpointPattern: "https://api.example.com/resource",
          status: "invalid",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("status");
    });

    it("should return 409 for duplicate endpointPattern", async () => {
      await createUser();
      await createPolicy(TEST_USER_ID, "https://api.example.com/resource");

      const { POST } = await import("@/app/api/policies/route");
      const request = new NextRequest("http://localhost/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpointPattern: "https://api.example.com/resource",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toContain("already exists");
    });

    it("should return 400 for invalid JSON body", async () => {
      const { POST } = await import("@/app/api/policies/route");
      const request = new NextRequest("http://localhost/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid JSON body");
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);

      const { POST } = await import("@/app/api/policies/route");
      const request = new NextRequest("http://localhost/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpointPattern: "https://api.example.com/resource" }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/policies/[id]", () => {
    it("should return a single policy by ID", async () => {
      await createUser();
      const policy = await createPolicy(TEST_USER_ID, "https://api.example.com/resource");

      const { GET } = await import("@/app/api/policies/[id]/route");
      const request = new NextRequest(`http://localhost/api/policies/${policy.id}`);
      const response = await GET(request, { params: Promise.resolve({ id: policy.id }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBe(policy.id);
      expect(data.endpointPattern).toBe("https://api.example.com/resource");
    });

    it("should return 404 for non-existent policy", async () => {
      const { GET } = await import("@/app/api/policies/[id]/route");
      const request = new NextRequest("http://localhost/api/policies/non-existent");
      const response = await GET(request, { params: Promise.resolve({ id: "non-existent" }) });

      expect(response.status).toBe(404);
    });

    it("should return 403 when policy belongs to another user", async () => {
      const otherUserId = "00000000-0000-4000-a000-000000000099";
      await createUser();
      await createUser(otherUserId);
      const policy = await createPolicy(otherUserId, "https://api.example.com/resource");

      const { GET } = await import("@/app/api/policies/[id]/route");
      const request = new NextRequest(`http://localhost/api/policies/${policy.id}`);
      const response = await GET(request, { params: Promise.resolve({ id: policy.id }) });

      expect(response.status).toBe(403);
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);

      const { GET } = await import("@/app/api/policies/[id]/route");
      const request = new NextRequest("http://localhost/api/policies/some-id");
      const response = await GET(request, { params: Promise.resolve({ id: "some-id" }) });

      expect(response.status).toBe(401);
    });
  });

  describe("PUT /api/policies/[id]", () => {
    it("should update an existing policy", async () => {
      await createUser();
      const policy = await createPolicy(TEST_USER_ID, "https://api.example.com/resource");

      const { PUT } = await import("@/app/api/policies/[id]/route");
      const request = new NextRequest(`http://localhost/api/policies/${policy.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payFromHotWallet: true,
          status: "draft",
        }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: policy.id }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.payFromHotWallet).toBe(true);
      expect(data.status).toBe("draft");
    });

    it("should return 404 for non-existent policy", async () => {
      const { PUT } = await import("@/app/api/policies/[id]/route");
      const request = new NextRequest("http://localhost/api/policies/non-existent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payFromHotWallet: true }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: "non-existent" }) });
      expect(response.status).toBe(404);
    });

    it("should return 403 when policy belongs to another user", async () => {
      const otherUserId = "00000000-0000-4000-a000-000000000099";
      await createUser();
      await createUser(otherUserId);
      const policy = await createPolicy(otherUserId, "https://api.example.com/resource");

      const { PUT } = await import("@/app/api/policies/[id]/route");
      const request = new NextRequest(`http://localhost/api/policies/${policy.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payFromHotWallet: true }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: policy.id }) });
      expect(response.status).toBe(403);
    });

    it("should return 409 when changing endpointPattern to one that already exists", async () => {
      await createUser();
      await createPolicy(TEST_USER_ID, "https://api.example.com/a");
      const policyB = await createPolicy(TEST_USER_ID, "https://api.example.com/b");

      const { PUT } = await import("@/app/api/policies/[id]/route");
      const request = new NextRequest(`http://localhost/api/policies/${policyB.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpointPattern: "https://api.example.com/a" }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: policyB.id }) });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toContain("already exists");
    });

    it("should return 400 for invalid JSON body", async () => {
      await createUser();
      const policy = await createPolicy(TEST_USER_ID, "https://api.example.com/resource");

      const { PUT } = await import("@/app/api/policies/[id]/route");
      const request = new NextRequest(`http://localhost/api/policies/${policy.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      const response = await PUT(request, { params: Promise.resolve({ id: policy.id }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid JSON body");
    });
  });

  describe("POST /api/policies/[id]/archive", () => {
    it("should archive a policy", async () => {
      await createUser();
      const policy = await createPolicy(TEST_USER_ID, "https://api.example.com/resource");

      const { POST } = await import("@/app/api/policies/[id]/archive/route");
      const request = new NextRequest(`http://localhost/api/policies/${policy.id}/archive`, {
        method: "POST",
      });

      const response = await POST(request, { params: Promise.resolve({ id: policy.id }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("archived");
      expect(data.archivedAt).toBeDefined();
    });

    it("should return 404 for non-existent policy", async () => {
      const { POST } = await import("@/app/api/policies/[id]/archive/route");
      const request = new NextRequest("http://localhost/api/policies/non-existent/archive", {
        method: "POST",
      });

      const response = await POST(request, { params: Promise.resolve({ id: "non-existent" }) });
      expect(response.status).toBe(404);
    });

    it("should return 403 when policy belongs to another user", async () => {
      const otherUserId = "00000000-0000-4000-a000-000000000099";
      await createUser();
      await createUser(otherUserId);
      const policy = await createPolicy(otherUserId, "https://api.example.com/resource");

      const { POST } = await import("@/app/api/policies/[id]/archive/route");
      const request = new NextRequest(`http://localhost/api/policies/${policy.id}/archive`, {
        method: "POST",
      });

      const response = await POST(request, { params: Promise.resolve({ id: policy.id }) });
      expect(response.status).toBe(403);
    });

    it("should return 400 when policy is already archived", async () => {
      await createUser();
      const policy = await createPolicy(TEST_USER_ID, "https://api.example.com/resource", {
        status: "archived",
        archivedAt: new Date(),
      });

      const { POST } = await import("@/app/api/policies/[id]/archive/route");
      const request = new NextRequest(`http://localhost/api/policies/${policy.id}/archive`, {
        method: "POST",
      });

      const response = await POST(request, { params: Promise.resolve({ id: policy.id }) });
      expect(response.status).toBe(400);
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);

      const { POST } = await import("@/app/api/policies/[id]/archive/route");
      const request = new NextRequest("http://localhost/api/policies/some-id/archive", {
        method: "POST",
      });

      const response = await POST(request, { params: Promise.resolve({ id: "some-id" }) });
      expect(response.status).toBe(401);
    });
  });
});
