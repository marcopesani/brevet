import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetStoreForTesting } from "@/lib/rate-limit";

// Mock getUserByApiKey
vi.mock("@/lib/data/users", () => ({
  getUserByApiKey: vi.fn(),
}));

// Mock MCP server + transport so we don't need a real MCP stack
vi.mock("@/lib/mcp/server", () => ({
  createMcpServer: vi.fn(() => ({
    connect: vi.fn(),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js", () => {
  return {
    WebStandardStreamableHTTPServerTransport: class {
      handleRequest = vi.fn(() => new Response("ok", { status: 200 }));
    },
  };
});

import { POST } from "../[humanHash]/route";
import { getUserByApiKey } from "@/lib/data/users";

const mockGetUserByApiKey = vi.mocked(getUserByApiKey);

const VALID_KEY = "brv_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
const VALID_USER_ID = "507f1f77bcf86cd799439011";

function makeRequest(opts: {
  bearerToken?: string;
  queryApiKey?: string;
}): Request {
  const url = new URL(`http://localhost:3000/api/mcp/${VALID_USER_ID}`);
  if (opts.queryApiKey) {
    url.searchParams.set("api_key", opts.queryApiKey);
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.bearerToken) {
    headers["authorization"] = `Bearer ${opts.bearerToken}`;
  }

  return new Request(url.toString(), {
    method: "POST",
    headers,
  });
}

describe("MCP route API key authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetStoreForTesting();
  });

  it("succeeds with valid Bearer token", async () => {
    mockGetUserByApiKey.mockResolvedValue({ userId: VALID_USER_ID });

    const response = await POST(makeRequest({ bearerToken: VALID_KEY }));

    expect(response.status).toBe(200);
    expect(mockGetUserByApiKey).toHaveBeenCalledWith(VALID_KEY);
  });

  it("succeeds with valid api_key query parameter", async () => {
    mockGetUserByApiKey.mockResolvedValue({ userId: VALID_USER_ID });

    const response = await POST(makeRequest({ queryApiKey: VALID_KEY }));

    expect(response.status).toBe(200);
    expect(mockGetUserByApiKey).toHaveBeenCalledWith(VALID_KEY);
  });

  it("returns 401 when no API key is provided", async () => {
    const response = await POST(makeRequest({}));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("API key required");
    expect(body.hint).toContain("Authorization: Bearer");
    expect(mockGetUserByApiKey).not.toHaveBeenCalled();
  });

  it("returns 401 when API key is invalid", async () => {
    mockGetUserByApiKey.mockResolvedValue(null);

    const response = await POST(makeRequest({ bearerToken: "brv_invalid" }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Invalid API key");
  });

  it("Bearer header takes precedence over query parameter", async () => {
    const headerKey = "brv_header_key_1234567890abcdef12345";
    const queryKey = "brv_query_key_1234567890abcdef12345";

    mockGetUserByApiKey.mockResolvedValue({ userId: VALID_USER_ID });

    await POST(
      makeRequest({ bearerToken: headerKey, queryApiKey: queryKey }),
    );

    expect(mockGetUserByApiKey).toHaveBeenCalledWith(headerKey);
    expect(mockGetUserByApiKey).not.toHaveBeenCalledWith(queryKey);
  });

  it("uses userId from API key lookup, not from URL path", async () => {
    const resolvedUserId = "60d5ec9af682fbd12a0aee00";
    mockGetUserByApiKey.mockResolvedValue({ userId: resolvedUserId });

    const { createMcpServer } = await import("@/lib/mcp/server");
    const mockCreateMcpServer = vi.mocked(createMcpServer);

    await POST(makeRequest({ bearerToken: VALID_KEY }));

    expect(mockCreateMcpServer).toHaveBeenCalledWith(resolvedUserId);
  });
});
