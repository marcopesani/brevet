import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resetTestDb } from "@/test/helpers/db";
import { PendingPayment } from "@/lib/models/pending-payment";
import { SmartAccount } from "@/lib/models/smart-account";
import { Transaction } from "@/lib/models/transaction";
import { User } from "@/lib/models/user";
import mongoose from "mongoose";

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

const TEST_USER_ID = new mongoose.Types.ObjectId().toString();

describe("x402_get_result tool", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetTestDb();
    server = new McpServer({ name: "test", version: "0.0.1" });
    const { registerTools } = await import("../register-tools");
    registerTools(server, TEST_USER_ID);
  });

  it("returns parsed JSON data for completed payment with JSON response", async () => {
    const future = new Date(Date.now() + 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "completed",
      expiresAt: future,
      responsePayload: '{"result": "success", "data": [1, 2, 3]}',
      responseStatus: 200,
      txHash: "0xabc123def456",
      completedAt: new Date(),
    });

    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment._id.toString(),
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
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "completed",
      expiresAt: future,
      responsePayload: "Plain text response body",
      responseStatus: 200,
      txHash: "0xdef789",
      completedAt: new Date(),
    });

    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment._id.toString(),
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("completed");
    expect(parsed.data).toBe("Plain text response body");
    expect(parsed.txHash).toBe("0xdef789");
  });

  it("returns awaiting_signature with time remaining for pending non-expired payment", async () => {
    const future = new Date(Date.now() + 600_000); // 10 minutes from now
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "pending",
      expiresAt: future,
    });

    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment._id.toString(),
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("awaiting_signature");
    expect(parsed.message).toContain("not yet signed");
    expect(parsed.timeRemainingSeconds).toBeGreaterThan(0);
    expect(parsed.timeRemainingSeconds).toBeLessThanOrEqual(600);
  });

  it("returns expired and updates status for pending payment past expiresAt", async () => {
    const past = new Date(Date.now() - 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "pending",
      expiresAt: past,
    });

    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment._id.toString(),
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("expired");
    expect(parsed.message).toContain("expired");

    // Verify the status was updated in the DB
    const updated = await PendingPayment.findById(payment._id).lean();
    expect(updated!.status).toBe("expired");
  });

  it("returns processing for approved payment", async () => {
    const future = new Date(Date.now() + 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "approved",
      expiresAt: future,
      signature: "0xsig",
    });

    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment._id.toString(),
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("processing");
    expect(parsed.message).toContain("being processed");
  });

  it("returns failed status with error details for failed payment", async () => {
    const future = new Date(Date.now() + 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "failed",
      expiresAt: future,
      responsePayload: "Internal Server Error",
      responseStatus: 500,
      completedAt: new Date(),
    });

    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment._id.toString(),
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("failed");
    expect(parsed.responseStatus).toBe(500);
    expect(parsed.error).toBe("Internal Server Error");
  });

  it("returns rejected status for rejected payment", async () => {
    const future = new Date(Date.now() + 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "rejected",
      expiresAt: future,
    });

    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment._id.toString(),
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("rejected");
    expect(parsed.message).toContain("rejected");
  });

  it("returns expired status for payment with expired status", async () => {
    const past = new Date(Date.now() - 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "expired",
      expiresAt: past,
    });

    const result = (await callTool(server, "x402_get_result", {
      paymentId: payment._id.toString(),
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("expired");
    expect(parsed.message).toContain("expired");
  });

  it("returns error for non-existent payment ID", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const result = (await callTool(server, "x402_get_result", {
      paymentId: fakeId,
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Payment not found");
  });
});

describe("x402_check_pending tool", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetTestDb();
    server = new McpServer({ name: "test", version: "0.0.1" });
    const { registerTools } = await import("../register-tools");
    registerTools(server, TEST_USER_ID);
  });

  it("returns completed status with guidance to use x402_get_result", async () => {
    const future = new Date(Date.now() + 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "completed",
      expiresAt: future,
      responsePayload: '{"data": "test"}',
      responseStatus: 200,
      txHash: "0xabc",
      completedAt: new Date(),
    });

    const result = (await callTool(server, "x402_check_pending", {
      paymentId: payment._id.toString(),
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("completed");
    expect(parsed.message).toContain("x402_get_result");
    expect(parsed.paymentId).toBe(payment._id.toString());
  });

  it("returns failed status with guidance to use x402_get_result", async () => {
    const future = new Date(Date.now() + 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "failed",
      expiresAt: future,
      responsePayload: "Error",
      responseStatus: 500,
      completedAt: new Date(),
    });

    const result = (await callTool(server, "x402_check_pending", {
      paymentId: payment._id.toString(),
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("failed");
    expect(parsed.message).toContain("x402_get_result");
    expect(parsed.paymentId).toBe(payment._id.toString());
  });

  it("returns processing status for approved payment", async () => {
    const future = new Date(Date.now() + 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "approved",
      expiresAt: future,
      signature: "0xsig",
    });

    const result = (await callTool(server, "x402_check_pending", {
      paymentId: payment._id.toString(),
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("processing");
    expect(parsed.message).toContain("settlement");
  });

  it("returns rejected status for rejected payment", async () => {
    const future = new Date(Date.now() + 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "rejected",
      expiresAt: future,
    });

    const result = (await callTool(server, "x402_check_pending", {
      paymentId: payment._id.toString(),
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("rejected");
    expect(parsed.message).toContain("rejected");
  });

  it("returns expired and updates status for expired pending payment", async () => {
    const past = new Date(Date.now() - 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "pending",
      expiresAt: past,
    });

    const result = (await callTool(server, "x402_check_pending", {
      paymentId: payment._id.toString(),
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("expired");

    // Verify the status was updated
    const updated = await PendingPayment.findById(payment._id).lean();
    expect(updated!.status).toBe("expired");
  });

  it("returns pending status with time remaining for active pending payment", async () => {
    const future = new Date(Date.now() + 600_000); // 10 min
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "pending",
      expiresAt: future,
    });

    const result = (await callTool(server, "x402_check_pending", {
      paymentId: payment._id.toString(),
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("pending");
    expect(parsed.id).toBe(payment._id.toString());
    expect(parsed.amountRaw).toBe(null);
    expect(parsed.amountDisplay).toBe(null);
    expect(parsed.url).toBe("https://api.example.com/resource");
    expect(parsed.timeRemainingSeconds).toBeGreaterThan(0);
    expect(parsed.timeRemainingSeconds).toBeLessThanOrEqual(600);
  });

  it("returns error for non-existent payment ID", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const result = (await callTool(server, "x402_check_pending", {
      paymentId: fakeId,
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });
});

// --- Multi-chain MCP tool tests ---

describe("x402_pay tool — multi-chain", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetTestDb();
    server = new McpServer({ name: "test", version: "0.0.1" });
    const { registerTools } = await import("../register-tools");
    registerTools(server, TEST_USER_ID);
  });

  it("passes chainId to executePayment when chain name is provided", async () => {
    const { executePayment } = await import("@/lib/x402/payment");
    (executePayment as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      response: new Response(JSON.stringify({ data: "ok" }), {
        headers: { "content-type": "application/json" },
      }),
    });

    await callTool(server, "x402_pay", {
      url: "https://api.example.com/resource",
      chain: "arbitrum",
    });

    expect(executePayment).toHaveBeenCalledWith(
      "https://api.example.com/resource",
      TEST_USER_ID,
      { method: "GET", body: undefined, headers: undefined },
      42161,
    );
  });

  it("passes chainId when numeric chain ID string is provided", async () => {
    const { executePayment } = await import("@/lib/x402/payment");
    (executePayment as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      response: new Response(JSON.stringify({ data: "ok" }), {
        headers: { "content-type": "application/json" },
      }),
    });

    await callTool(server, "x402_pay", {
      url: "https://api.example.com/resource",
      chain: "42161",
    });

    expect(executePayment).toHaveBeenCalledWith(
      "https://api.example.com/resource",
      TEST_USER_ID,
      { method: "GET", body: undefined, headers: undefined },
      42161,
    );
  });

  it("does not pass chainId when chain is omitted", async () => {
    const { executePayment } = await import("@/lib/x402/payment");
    const mockFn = executePayment as ReturnType<typeof vi.fn>;
    mockFn.mockReset();
    mockFn.mockResolvedValue({
      success: true,
      response: new Response(JSON.stringify({ data: "ok" }), {
        headers: { "content-type": "application/json" },
      }),
    });

    await callTool(server, "x402_pay", {
      url: "https://api.example.com/resource",
    });

    const callArgs = mockFn.mock.calls[0];
    expect(callArgs[2]).not.toHaveProperty("chainId");
    expect(callArgs[3]).toBeUndefined();
  });

  it("returns error for unsupported chain name", async () => {
    const result = (await callTool(server, "x402_pay", {
      url: "https://api.example.com/resource",
      chain: "solana",
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unsupported chain");
  });
});

describe("x402_check_balance tool — multi-chain", () => {
  let server: McpServer;
  const userId = new mongoose.Types.ObjectId();

  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetTestDb();

    // Create a user
    await User.create({
      _id: userId,
      email: "test@example.com",
      walletAddress: "0x" + "a".repeat(40),
    });

    server = new McpServer({ name: "test", version: "0.0.1" });
    const { registerTools } = await import("../register-tools");
    registerTools(server, userId.toString());
  });

  it("returns balances across all chains when no chain specified", async () => {
    const { getUsdcBalance } = await import("@/lib/hot-wallet");

    // Create smart accounts on two chains
    await SmartAccount.create({
      userId,
      ownerAddress: "0x" + "a".repeat(40),
      chainId: 8453,
      smartAccountAddress: "0x" + "b".repeat(40),
      sessionKeyAddress: "0x" + "c".repeat(40),
      sessionKeyEncrypted: "enc1",
      sessionKeyStatus: "active",
    });
    await SmartAccount.create({
      userId,
      ownerAddress: "0x" + "a".repeat(40),
      chainId: 42161,
      smartAccountAddress: "0x" + "d".repeat(40),
      sessionKeyAddress: "0x" + "e".repeat(40),
      sessionKeyEncrypted: "enc2",
      sessionKeyStatus: "active",
    });

    (getUsdcBalance as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("10.0")
      .mockResolvedValueOnce("20.0");

    const result = (await callTool(server, "x402_check_balance", {})) as ToolResult;
    const parsed = parseToolResult(result);

    expect(parsed.balances).toHaveLength(2);
    expect(parsed.balances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chainId: 8453, balance: "10.0" }),
        expect.objectContaining({ chainId: 42161, balance: "20.0" }),
      ]),
    );
    expect(result.isError).toBeUndefined();
  });

  it("returns single chain balance when chain name specified", async () => {
    const { getUsdcBalance } = await import("@/lib/hot-wallet");

    await SmartAccount.create({
      userId,
      ownerAddress: "0x" + "a".repeat(40),
      chainId: 42161,
      smartAccountAddress: "0x" + "b".repeat(40),
      sessionKeyAddress: "0x" + "c".repeat(40),
      sessionKeyEncrypted: "enc1",
      sessionKeyStatus: "active",
    });

    (getUsdcBalance as ReturnType<typeof vi.fn>).mockResolvedValue("25.5");

    const result = (await callTool(server, "x402_check_balance", {
      chain: "arbitrum",
    })) as ToolResult;
    const parsed = parseToolResult(result);

    expect(parsed.chainId).toBe(42161);
    expect(parsed.chain).toBe("Arbitrum One");
    expect(parsed.usdcBalance).toBe("25.5");
    expect(result.isError).toBeUndefined();
  });

  it("returns message when no smart accounts exist on any chain", async () => {
    const result = (await callTool(server, "x402_check_balance", {})) as ToolResult;

    expect(result.content[0].text).toContain("No smart accounts found");
    expect(result.isError).toBeUndefined();
  });

  it("returns message when no smart account on specified chain", async () => {
    const result = (await callTool(server, "x402_check_balance", {
      chain: "optimism",
    })) as ToolResult;

    expect(result.content[0].text).toContain("No smart account found");
    expect(result.isError).toBeUndefined();
  });

  it("returns error for unsupported chain", async () => {
    const result = (await callTool(server, "x402_check_balance", {
      chain: "invalid-chain",
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unsupported chain");
  });
});

describe("x402_spending_history tool — multi-chain", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetTestDb();
    server = new McpServer({ name: "test", version: "0.0.1" });
    const { registerTools } = await import("../register-tools");
    registerTools(server, TEST_USER_ID);
  });

  it("filters transactions by chain when chain param provided", async () => {
    const userOid = new mongoose.Types.ObjectId(TEST_USER_ID);

    await Transaction.create([
      {
        amount: 0.01,
        endpoint: "https://api.example.com/a",
        network: "base",
        status: "completed",
        userId: userOid,
        chainId: 8453,
      },
      {
        amount: 0.02,
        endpoint: "https://api.example.com/b",
        network: "arbitrum",
        status: "completed",
        userId: userOid,
        chainId: 42161,
      },
    ]);

    const result = (await callTool(server, "x402_spending_history", {
      chain: "arbitrum",
    })) as ToolResult;
    const parsed = parseToolResult(result);

    expect(parsed.count).toBe(1);
    expect(parsed.transactions[0].endpoint).toBe("https://api.example.com/b");
  });

  it("returns all transactions when no chain param", async () => {
    const userOid = new mongoose.Types.ObjectId(TEST_USER_ID);

    await Transaction.create([
      {
        amount: 0.01,
        endpoint: "https://api.example.com/a",
        network: "base",
        status: "completed",
        userId: userOid,
        chainId: 8453,
      },
      {
        amount: 0.02,
        endpoint: "https://api.example.com/b",
        network: "arbitrum",
        status: "completed",
        userId: userOid,
        chainId: 42161,
      },
    ]);

    const result = (await callTool(server, "x402_spending_history", {})) as ToolResult;
    const parsed = parseToolResult(result);

    expect(parsed.count).toBe(2);
  });

  it("returns error for unsupported chain", async () => {
    const result = (await callTool(server, "x402_spending_history", {
      chain: "solana",
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unsupported chain");
  });
});

describe("x402_check_pending tool — chain info in response", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetTestDb();
    server = new McpServer({ name: "test", version: "0.0.1" });
    const { registerTools } = await import("../register-tools");
    registerTools(server, TEST_USER_ID);
  });

  it("includes chainId and chain name in pending payment response", async () => {
    const future = new Date(Date.now() + 600_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "pending",
      expiresAt: future,
      chainId: 42161,
    });

    const result = (await callTool(server, "x402_check_pending", {
      paymentId: payment._id.toString(),
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("pending");
    expect(parsed.chainId).toBe(42161);
    expect(parsed.chain).toBe("Arbitrum One");
  });

  it("includes default chain info when payment uses default chainId", async () => {
    const future = new Date(Date.now() + 600_000);
    // Create a payment without explicit chainId (gets default from model)
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/resource",
      amount: 0.05,
      paymentRequirements: "{}",
      status: "pending",
      expiresAt: future,
    });

    const result = (await callTool(server, "x402_check_pending", {
      paymentId: payment._id.toString(),
    })) as ToolResult;

    const parsed = parseToolResult(result);
    expect(parsed.status).toBe("pending");
    // Default chain in test env is 84532 (Base Sepolia)
    expect(parsed.chainId).toBe(84532);
    expect(parsed.chain).toBe("Base Sepolia");
  });
});
