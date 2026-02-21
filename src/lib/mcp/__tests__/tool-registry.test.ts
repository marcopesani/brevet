import { describe, it, expect, vi, beforeEach } from "vitest";
import { MCP_TOOLS, MCP_TOOL_NAMES } from "../tool-registry";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Mock dependencies used by registerTools
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

describe("MCP tool registry", () => {
  it("has exactly 6 entries", () => {
    expect(MCP_TOOLS).toHaveLength(6);
  });

  it("MCP_TOOL_NAMES matches the names in MCP_TOOLS", () => {
    const names = MCP_TOOLS.map((t) => t.name);
    expect(MCP_TOOL_NAMES).toEqual(names);
  });

  it("every tool has a non-empty name and summary", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.summary).toBeTruthy();
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.summary.length).toBeGreaterThan(0);
    }
  });

  it("tool names follow the x402_* naming convention", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.name).toMatch(/^x402_/);
    }
  });

  it("has no duplicate tool names", () => {
    const names = MCP_TOOLS.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

describe("registry stays in sync with registerTools", () => {
  let server: McpServer;

  beforeEach(() => {
    vi.restoreAllMocks();
    server = new McpServer({ name: "test", version: "0.0.1" });
  });

  it("registerTools registers exactly the tools in the registry", async () => {
    const { registerTools } = await import("../register-tools");
    registerTools(server, "fake-user-id");

    const registeredTools = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    const registeredNames = new Set(Object.keys(registeredTools));

    for (const name of MCP_TOOL_NAMES) {
      expect(registeredNames.has(name)).toBe(true);
    }

    // Also verify no extra tools were registered beyond the registry
    for (const name of registeredNames) {
      expect(MCP_TOOL_NAMES).toContain(name);
    }
  });
});
