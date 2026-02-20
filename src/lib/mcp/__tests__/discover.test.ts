import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DiscoveryResponse } from "../tools/x402-discover";

// Mock dependencies used by other tools in registerTools
vi.mock("@/lib/x402/payment", () => ({
  executePayment: vi.fn(),
}));
vi.mock("@/lib/hot-wallet", () => ({
  getUsdcBalance: vi.fn(),
}));
vi.mock("@/lib/smart-account", () => ({
  computeSmartAccountAddress: vi.fn().mockResolvedValue("0x" + "c".repeat(40)),
  createSessionKey: vi.fn().mockReturnValue({
    address: "0x" + "d".repeat(40),
    encryptedPrivateKey: "encrypted-key",
  }),
}));

const MOCK_DISCOVERY_RESPONSE: DiscoveryResponse = {
  items: [
    {
      resource: "https://example.com/api/spam-detect",
      type: "http",
      x402Version: 1,
      lastUpdated: "2026-01-01T00:00:00Z",
      metadata: {},
      accepts: [
        {
          description: "Detect whether content is spam",
          maxAmountRequired: "100000",
          network: "base",
          scheme: "exact",
          resource: "https://example.com/api/spam-detect",
          payTo: "0x1234",
          asset: "0xUSDC",
        },
      ],
    },
    {
      resource: "https://example.com/api/translate",
      type: "http",
      x402Version: 1,
      lastUpdated: "2026-01-01T00:00:00Z",
      metadata: {},
      accepts: [
        {
          description: "Translate text between languages",
          maxAmountRequired: "50000",
          network: "base-sepolia",
          scheme: "exact",
          resource: "https://example.com/api/translate",
          payTo: "0x5678",
          asset: "0xUSDC",
        },
      ],
    },
    {
      resource: "https://example.com/api/polymarket",
      type: "http",
      x402Version: 2,
      lastUpdated: "2026-01-01T00:00:00Z",
      metadata: {},
      accepts: [
        {
          description: "Get trending prediction markets",
          maxAmountRequired: "10000",
          network: "eip155:8453",
          scheme: "exact",
          resource: "https://example.com/api/polymarket",
          payTo: "0xabcd",
          asset: "0xUSDC",
        },
      ],
    },
  ],
  pagination: { limit: 100, offset: 0, total: 3 },
  x402Version: 1,
};

// Helper to call a registered MCP tool by name
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown> = {},
) {
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: Record<string, unknown>) => Promise<unknown> }> })._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool "${toolName}" not registered`);
  return tool.handler(args);
}

describe("x402_discover tool", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.restoreAllMocks();
    server = new McpServer({ name: "test", version: "0.0.1" });
    const { registerTools } = await import("../register-tools");
    registerTools(server, "test-user");
  });

  it("should be registered with correct schema", () => {
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect(tools).toHaveProperty("x402_discover");
  });

  it("should return formatted endpoints on successful response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_DISCOVERY_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = (await callTool(server, "x402_discover", {})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(3);
    expect(parsed.endpoints).toHaveLength(3);
    expect(parsed.endpoints[0]).toEqual({
      url: "https://example.com/api/spam-detect",
      description: "Detect whether content is spam",
      price: "0.100000 USDC",
      network: "base",
      scheme: "exact",
    });
  });

  it("should filter by query keyword in description", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_DISCOVERY_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = (await callTool(server, "x402_discover", {
      query: "spam",
    })) as { content: Array<{ type: string; text: string }> };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.endpoints[0].url).toBe(
      "https://example.com/api/spam-detect",
    );
  });

  it("should filter by query keyword in URL", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_DISCOVERY_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = (await callTool(server, "x402_discover", {
      query: "polymarket",
    })) as { content: Array<{ type: string; text: string }> };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.endpoints[0].url).toBe(
      "https://example.com/api/polymarket",
    );
  });

  it("should filter by network", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_DISCOVERY_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = (await callTool(server, "x402_discover", {
      network: "base-sepolia",
    })) as { content: Array<{ type: string; text: string }> };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.endpoints[0].url).toBe(
      "https://example.com/api/translate",
    );
  });

  it("should filter by both query and network", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_DISCOVERY_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = (await callTool(server, "x402_discover", {
      query: "spam",
      network: "base-sepolia",
    })) as { content: Array<{ type: string; text: string }> };

    // spam is on "base", not "base-sepolia", so no results
    expect(result.content[0].text).toBe(
      "No endpoints found matching your query.",
    );
  });

  it("should return message when no results match", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ items: [], pagination: { limit: 20, offset: 0, total: 0 }, x402Version: 1 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = (await callTool(server, "x402_discover", {})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toBe(
      "No endpoints found matching your query.",
    );
  });

  it("should handle API HTTP errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Server Error", { status: 500 }),
    );

    const result = (await callTool(server, "x402_discover", {})) as {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "Error: Discovery API returned HTTP 500",
    );
  });

  it("should handle network errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network request failed"),
    );

    const result = (await callTool(server, "x402_discover", {})) as {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error: Network request failed");
  });

  it("should handle invalid response format", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ unexpected: "format" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = (await callTool(server, "x402_discover", {})) as {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "Error: Unexpected response format from discovery API",
    );
  });

  it("should pass limit to API query params", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_DISCOVERY_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await callTool(server, "x402_discover", { limit: 5 });

    const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("limit")).toBe("5");
  });

  it("should use default limit of 20", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_DISCOVERY_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await callTool(server, "x402_discover", {});

    const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("limit")).toBe("20");
  });

  it("should be case-insensitive for query filtering", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_DISCOVERY_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = (await callTool(server, "x402_discover", {
      query: "SPAM",
    })) as { content: Array<{ type: string; text: string }> };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(1);
  });

  it("should be case-insensitive for network filtering", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_DISCOVERY_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = (await callTool(server, "x402_discover", {
      network: "BASE",
    })) as { content: Array<{ type: string; text: string }> };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.endpoints[0].network).toBe("base");
  });
});
