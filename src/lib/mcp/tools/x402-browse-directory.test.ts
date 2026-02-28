import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSearchMerchants = vi.fn();
const mockGetCategories = vi.fn();

vi.mock("@/lib/merchants", () => ({
  searchMerchants: mockSearchMerchants,
  getCategories: mockGetCategories,
}));

// Minimal mock for McpServer
type ToolHandler = (params: Record<string, unknown>) => Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}>;

function createMockServer() {
  const tools = new Map<string, { handler: ToolHandler }>();
  return {
    registerTool(name: string, _config: unknown, handler: ToolHandler) {
      tools.set(name, { handler });
    },
    call(name: string, params: Record<string, unknown>) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Tool ${name} not registered`);
      return tool.handler(params);
    },
  };
}

describe("x402_browse_directory", () => {
  let server: ReturnType<typeof createMockServer>;

  beforeEach(async () => {
    mockSearchMerchants.mockReset();
    mockGetCategories.mockReset();
    server = createMockServer();

    const { registerX402BrowseDirectory } = await import(
      "./x402-browse-directory"
    );
    registerX402BrowseDirectory(server as never, "test-user-id");
  });

  it("returns merchants matching a query", async () => {
    mockSearchMerchants.mockReturnValue([
      {
        name: "Weather API",
        url: "https://weather.example.com",
        description: "Get weather data",
        category: "service",
        chains: ["base"],
        pricing: "$0.001 per request",
        source: "curated",
      },
    ]);

    const result = await server.call("x402_browse_directory", {
      query: "weather",
    });

    expect(mockSearchMerchants).toHaveBeenCalledWith("weather", undefined);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.merchants[0].name).toBe("Weather API");
    expect(parsed.merchants[0].pricing).toBe("$0.001 per request");
    expect(parsed.merchants[0].source).toBe("curated");
  });

  it("returns merchants filtered by category", async () => {
    mockSearchMerchants.mockReturnValue([
      {
        name: "Infra Service",
        url: "https://infra.example.com",
        description: "Infrastructure provider",
        category: "infrastructure",
        chains: ["ethereum", "base"],
        source: "bazaar",
      },
    ]);

    const result = await server.call("x402_browse_directory", {
      category: "infrastructure",
    });

    expect(mockSearchMerchants).toHaveBeenCalledWith(
      undefined,
      "infrastructure",
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.merchants[0].category).toBe("infrastructure");
  });

  it("returns all merchants when no params provided", async () => {
    mockSearchMerchants.mockReturnValue([
      {
        name: "Service A",
        url: "https://a.example.com",
        description: "Service A",
        category: "service",
        chains: ["base"],
        source: "curated",
      },
      {
        name: "Service B",
        url: "https://b.example.com",
        description: "Service B",
        category: "infrastructure",
        chains: ["ethereum"],
        source: "bazaar",
      },
    ]);

    const result = await server.call("x402_browse_directory", {});

    expect(mockSearchMerchants).toHaveBeenCalledWith(undefined, undefined);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(2);
  });

  it("returns helpful message when no merchants found", async () => {
    mockSearchMerchants.mockReturnValue([]);
    mockGetCategories.mockReturnValue(["service", "infrastructure"]);

    const result = await server.call("x402_browse_directory", {
      query: "nonexistent",
    });

    expect(result.content[0].text).toContain("No merchants found");
    expect(result.content[0].text).toContain("service, infrastructure");
    expect(result.isError).toBeUndefined();
  });

  it("returns no-match message without categories if none exist", async () => {
    mockSearchMerchants.mockReturnValue([]);
    mockGetCategories.mockReturnValue([]);

    const result = await server.call("x402_browse_directory", {
      query: "nonexistent",
    });

    expect(result.content[0].text).toBe(
      "No merchants found matching your query.",
    );
  });

  it("omits pricing when not present on merchant", async () => {
    mockSearchMerchants.mockReturnValue([
      {
        name: "No Price API",
        url: "https://noprice.example.com",
        description: "No pricing info",
        category: "service",
        chains: ["base"],
        source: "curated",
      },
    ]);

    const result = await server.call("x402_browse_directory", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.merchants[0]).not.toHaveProperty("pricing");
  });

  it("returns error on unexpected exception", async () => {
    mockSearchMerchants.mockImplementation(() => {
      throw new Error("File read failed");
    });

    const result = await server.call("x402_browse_directory", {
      query: "test",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("File read failed");
  });
});
