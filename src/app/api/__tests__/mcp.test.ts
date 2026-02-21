import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetTestDb, seedTestUser } from "@/test/helpers/db";
import { TEST_USER_HUMAN_HASH, TEST_USER_ID } from "@/test/helpers/fixtures";

// Mock rate-limit to avoid interference
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue(null),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

// Mock getUserByApiKey to authenticate test requests
vi.mock("@/lib/data/users", () => ({
  getUserByApiKey: vi.fn().mockResolvedValue({ userId: TEST_USER_ID }),
}));

// Mock hot-wallet to avoid real RPC calls
vi.mock("@/lib/hot-wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hot-wallet")>();
  return {
    ...actual,
    getUsdcBalance: vi.fn().mockResolvedValue("10.000000"),
  };
});

// Mock x402 payment to avoid real HTTP calls
vi.mock("@/lib/x402/payment", () => ({
  executePayment: vi.fn().mockResolvedValue({
    success: false,
    error: "Test mode",
  }),
}));

const TEST_API_KEY = "brv_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  Authorization: `Bearer ${TEST_API_KEY}`,
};

/**
 * Parse the JSON-RPC response from an MCP SSE response.
 * The MCP SDK returns SSE with `event: message` and `data: {...}` lines.
 */
async function parseMcpResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  // Extract the JSON data from the SSE "data:" line
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      return JSON.parse(line.slice(6));
    }
  }
  throw new Error(`No data line found in SSE response: ${text}`);
}

describe("MCP API route", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("POST /api/mcp/[humanHash]", () => {
    it("should accept a JSON-RPC initialize request", async () => {
      await seedTestUser();
      const { POST } = await import("@/app/api/mcp/[humanHash]/route");

      const request = new Request(
        `http://localhost/api/mcp/${TEST_USER_HUMAN_HASH}`,
        {
          method: "POST",
          headers: MCP_HEADERS,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "test-client", version: "1.0" },
            },
          }),
        },
      );

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = (await parseMcpResponse(response)) as Record<string, unknown>;
      expect(data.jsonrpc).toBe("2.0");
      expect(data.id).toBe(1);
      expect(data.result).toBeDefined();
      const result = data.result as Record<string, unknown>;
      expect(result.protocolVersion).toBeDefined();
      expect(result.serverInfo).toBeDefined();
      const serverInfo = result.serverInfo as Record<string, unknown>;
      expect(serverInfo.name).toBe("brevet");
    });

    it("should include tool capabilities in initialize response", async () => {
      await seedTestUser();
      const { POST } = await import("@/app/api/mcp/[humanHash]/route");

      const request = new Request(
        `http://localhost/api/mcp/${TEST_USER_HUMAN_HASH}`,
        {
          method: "POST",
          headers: MCP_HEADERS,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "test-client", version: "1.0" },
            },
          }),
        },
      );

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = (await parseMcpResponse(response)) as Record<string, unknown>;
      const result = data.result as Record<string, unknown>;
      expect(result.capabilities).toBeDefined();
    });

    it("should handle invalid JSON-RPC method gracefully", async () => {
      await seedTestUser();
      const { POST } = await import("@/app/api/mcp/[humanHash]/route");

      const request = new Request(
        `http://localhost/api/mcp/${TEST_USER_HUMAN_HASH}`,
        {
          method: "POST",
          headers: MCP_HEADERS,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "nonexistent/method",
            params: {},
          }),
        },
      );

      const response = await POST(request);
      const data = (await parseMcpResponse(response)) as Record<string, unknown>;
      expect(data.jsonrpc).toBe("2.0");
      expect(data.error).toBeDefined();
    });

    it("should return 401 for invalid API key", async () => {
      const { getUserByApiKey } = await import("@/lib/data/users");
      const mockGetUserByApiKey = vi.mocked(getUserByApiKey);
      mockGetUserByApiKey.mockResolvedValueOnce(null);

      const { POST } = await import("@/app/api/mcp/[humanHash]/route");

      const request = new Request(
        `http://localhost/api/mcp/${TEST_USER_HUMAN_HASH}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            Authorization: "Bearer brv_invalid_key_000000000000000000",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "test-client", version: "1.0" },
            },
          }),
        },
      );

      const response = await POST(request);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe("Invalid API key");
    });
  });
});
