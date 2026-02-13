import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Mock dependencies used by other tools in registerTools
vi.mock("@/lib/x402/payment", () => ({
  executePayment: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    transaction: { findMany: vi.fn() },
    pendingPayment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/hot-wallet", () => ({
  getUsdcBalance: vi.fn(),
}));

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

describe("demo_walletconnect tool", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.restoreAllMocks();
    server = new McpServer({ name: "test", version: "0.0.1" });
    const { registerTools } = await import("../tools");
    registerTools(server, "test-user");
  });

  it("should be registered on the server", () => {
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect(tools).toHaveProperty("demo_walletconnect");
  });

  it("should return expected text content when called", async () => {
    const result = (await callTool(server, "demo_walletconnect", {})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe(
      "Displaying WalletConnect demo UI. Connect your wallet using the interface above.",
    );
  });
});
