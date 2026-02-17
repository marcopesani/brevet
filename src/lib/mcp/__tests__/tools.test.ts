import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/db";
import { getUsdcBalance } from "@/lib/hot-wallet";

// Mock dependencies used by registerTools
vi.mock("@/lib/x402/payment", () => ({
  executePayment: vi.fn(),
}));
vi.mock("@/lib/hot-wallet", () => ({
  getUsdcBalance: vi.fn(),
}));

type PrismaMock = typeof prisma & { _stores: Record<string, unknown[]> };

// Helper to call a registered MCP tool by name
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown> = {},
) {
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: Record<string, unknown>) => Promise<unknown> }
      >;
    }
  )._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool "${toolName}" not registered`);
  return tool.handler(args);
}

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

function parseToolResult(result: ToolResult) {
  return JSON.parse(result.content[0].text);
}

const TEST_USER_ID = "test-user-id";

describe("x402_get_result tool", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.restoreAllMocks();
    const mock = prisma as PrismaMock;
    for (const store of Object.values(mock._stores)) {
      (store as unknown[]).length = 0;
    }
    server = new McpServer({ name: "test", version: "0.0.1" });
    const { registerTools } = await import("../tools");
    registerTools(server, TEST_USER_ID);
  });

  it("returns parsed JSON data for completed payment with JSON response", async () => {
    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/resource",
        amount: 0.05,
        paymentRequirements: "{}",
        status: "completed",
        expiresAt: future,
        responsePayload: '{"result": "success", "data": [1, 2, 3]}',
        responseStatus: 200,
        txHash: "0xabc123def456",
        completedAt: new Date(),
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});
    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment!.id,
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("completed");
    expect(parsed.responseStatus).toBe(200);
    expect(parsed.data).toEqual({ result: "success", data: [1, 2, 3] });
    expect(parsed.txHash).toBe("0xabc123def456");
    expect(result.isError).toBeUndefined();
  });

  it("returns text data for completed payment with non-JSON response", async () => {
    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/resource",
        amount: 0.05,
        paymentRequirements: "{}",
        status: "completed",
        expiresAt: future,
        responsePayload: "Plain text response body",
        responseStatus: 200,
        txHash: "0xdef789",
        completedAt: new Date(),
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});
    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment!.id,
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("completed");
    expect(parsed.data).toBe("Plain text response body");
    expect(parsed.txHash).toBe("0xdef789");
  });

  it("returns awaiting_signature with time remaining for pending non-expired payment", async () => {
    const future = new Date(Date.now() + 600_000); // 10 minutes from now
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/resource",
        amount: 0.05,
        paymentRequirements: "{}",
        status: "pending",
        expiresAt: future,
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});
    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment!.id,
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("awaiting_signature");
    expect(parsed.message).toContain("not yet signed");
    expect(parsed.timeRemainingSeconds).toBeGreaterThan(0);
    expect(parsed.timeRemainingSeconds).toBeLessThanOrEqual(600);
  });

  it("returns expired and updates status for pending payment past expiresAt", async () => {
    const past = new Date(Date.now() - 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/resource",
        amount: 0.05,
        paymentRequirements: "{}",
        status: "pending",
        expiresAt: past,
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});
    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment!.id,
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("expired");
    expect(parsed.message).toContain("expired");

    // Verify the status was updated in the store
    const updated = await prisma.pendingPayment.findUnique({
      where: { id: payment!.id },
    });
    expect(updated!.status).toBe("expired");
  });

  it("returns processing for approved payment", async () => {
    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/resource",
        amount: 0.05,
        paymentRequirements: "{}",
        status: "approved",
        expiresAt: future,
        signature: "0xsig",
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});
    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment!.id,
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("processing");
    expect(parsed.message).toContain("being processed");
  });

  it("returns failed status with error details for failed payment", async () => {
    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/resource",
        amount: 0.05,
        paymentRequirements: "{}",
        status: "failed",
        expiresAt: future,
        responsePayload: "Internal Server Error",
        responseStatus: 500,
        completedAt: new Date(),
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});
    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment!.id,
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("failed");
    expect(parsed.responseStatus).toBe(500);
    expect(parsed.error).toBe("Internal Server Error");
  });

  it("returns rejected status for rejected payment", async () => {
    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/resource",
        amount: 0.05,
        paymentRequirements: "{}",
        status: "rejected",
        expiresAt: future,
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});
    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment!.id,
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("rejected");
    expect(parsed.message).toContain("rejected");
  });

  it("returns expired status for payment with expired status", async () => {
    const past = new Date(Date.now() - 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/resource",
        amount: 0.05,
        paymentRequirements: "{}",
        status: "expired",
        expiresAt: past,
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});
    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment!.id,
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("expired");
    expect(parsed.message).toContain("expired");
  });

  it("returns error for non-existent payment ID", async () => {
    const result = (await callTool(server, "x402_get_result", {
      paymentId: "nonexistent-id",
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Payment not found");
  });
});

describe("x402_check_pending tool", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.restoreAllMocks();
    const mock = prisma as PrismaMock;
    for (const store of Object.values(mock._stores)) {
      (store as unknown[]).length = 0;
    }
    server = new McpServer({ name: "test", version: "0.0.1" });
    const { registerTools } = await import("../tools");
    registerTools(server, TEST_USER_ID);
  });

  it("returns completed status with guidance to use x402_get_result", async () => {
    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/resource",
        amount: 0.05,
        paymentRequirements: "{}",
        status: "completed",
        expiresAt: future,
        responsePayload: '{"data": "test"}',
        responseStatus: 200,
        txHash: "0xabc",
        completedAt: new Date(),
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});
    const result = (await callTool(server, "x402_check_pending", {
      paymentId: payment!.id,
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("completed");
    expect(parsed.message).toContain("x402_get_result");
    expect(parsed.paymentId).toBe(payment!.id);
  });

  it("returns failed status with guidance to use x402_get_result", async () => {
    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/resource",
        amount: 0.05,
        paymentRequirements: "{}",
        status: "failed",
        expiresAt: future,
        responsePayload: "Error",
        responseStatus: 500,
        completedAt: new Date(),
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});
    const result = (await callTool(server, "x402_check_pending", {
      paymentId: payment!.id,
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("failed");
    expect(parsed.message).toContain("x402_get_result");
    expect(parsed.paymentId).toBe(payment!.id);
  });

  it("returns processing status for approved payment", async () => {
    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/resource",
        amount: 0.05,
        paymentRequirements: "{}",
        status: "approved",
        expiresAt: future,
        signature: "0xsig",
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});
    const result = (await callTool(server, "x402_check_pending", {
      paymentId: payment!.id,
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("processing");
    expect(parsed.message).toContain("settlement");
  });

  it("returns rejected status for rejected payment", async () => {
    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/resource",
        amount: 0.05,
        paymentRequirements: "{}",
        status: "rejected",
        expiresAt: future,
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});
    const result = (await callTool(server, "x402_check_pending", {
      paymentId: payment!.id,
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("rejected");
    expect(parsed.message).toContain("rejected");
  });

  it("returns expired and updates status for expired pending payment", async () => {
    const past = new Date(Date.now() - 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/resource",
        amount: 0.05,
        paymentRequirements: "{}",
        status: "pending",
        expiresAt: past,
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});
    const result = (await callTool(server, "x402_check_pending", {
      paymentId: payment!.id,
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("expired");

    // Verify the status was updated
    const updated = await prisma.pendingPayment.findUnique({
      where: { id: payment!.id },
    });
    expect(updated!.status).toBe("expired");
  });

  it("returns pending status with time remaining for active pending payment", async () => {
    const future = new Date(Date.now() + 600_000); // 10 min
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/resource",
        amount: 0.05,
        paymentRequirements: "{}",
        status: "pending",
        expiresAt: future,
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});
    const result = (await callTool(server, "x402_check_pending", {
      paymentId: payment!.id,
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("pending");
    expect(parsed.id).toBe(payment!.id);
    expect(parsed.amount).toBe(0.05);
    expect(parsed.url).toBe("https://api.example.com/resource");
    expect(parsed.timeRemainingSeconds).toBeGreaterThan(0);
    expect(parsed.timeRemainingSeconds).toBeLessThanOrEqual(600);
  });

  it("returns error for non-existent payment ID", async () => {
    const result = (await callTool(server, "x402_check_pending", {
      paymentId: "nonexistent-id",
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });
});

describe("x402_wallet tool", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.restoreAllMocks();
    const mock = prisma as PrismaMock;
    for (const store of Object.values(mock._stores)) {
      (store as unknown[]).length = 0;
    }
    server = new McpServer({ name: "test", version: "0.0.1" });
    const { registerTools } = await import("../tools");
    registerTools(server, TEST_USER_ID);
  });

  it("returns wallet info with balance in structuredContent for user with hot wallet", async () => {
    await prisma.user.create({
      data: {
        id: TEST_USER_ID,
        walletAddress: "0xUserWalletAddress",
      },
    });
    await prisma.hotWallet.create({
      data: {
        userId: TEST_USER_ID,
        address: "0xHotWalletAddress",
        encryptedPrivateKey: "encrypted-key",
      },
    });

    vi.mocked(getUsdcBalance).mockResolvedValue("12.500000");

    const result = (await callTool(server, "x402_wallet")) as ToolResult & {
      structuredContent?: Record<string, unknown>;
    };

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent!.walletAddress).toBe("0xUserWalletAddress");
    expect(result.structuredContent!.hotWalletAddress).toBe("0xHotWalletAddress");
    expect(result.structuredContent!.network).toBe("Base Sepolia");
    expect(result.structuredContent!.usdcBalance).toBe("12.500000");
  });

  it("returns error when user not found", async () => {
    const result = (await callTool(server, "x402_wallet")) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("User not found");
  });

  it("returns error when user has no hot wallet", async () => {
    await prisma.user.create({
      data: {
        id: TEST_USER_ID,
        walletAddress: "0xUserWalletAddress",
      },
    });

    const result = (await callTool(server, "x402_wallet")) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No hot wallet configured");
  });
});
