import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetTestDb, seedTestUser } from "@/test/helpers/db";
import { createTestTransaction, createTestPendingPayment } from "@/test/helpers/fixtures";
import { EndpointPolicy } from "@/lib/models/endpoint-policy";
import { Transaction } from "@/lib/models/transaction";
import { PendingPayment } from "@/lib/models/pending-payment";

/**
 * Minimal harness that captures tool handlers registered via McpServer.registerTool().
 * Allows us to call MCP tool handlers directly without HTTP transport.
 */
type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

interface CapturedTool {
  name: string;
  meta: unknown;
  handler: ToolHandler;
}

function createToolCapture() {
  const tools: CapturedTool[] = [];

  const fakeMcpServer = {
    registerTool(
      name: string,
      meta: unknown,
      handler: ToolHandler,
    ) {
      tools.push({ name, meta, handler });
    },
  };

  return { server: fakeMcpServer, tools };
}

/**
 * Helper to find a tool by name from the captured tools array.
 */
function findTool(tools: CapturedTool[], name: string): CapturedTool | undefined {
  return tools.find((t) => t.name === name);
}

// Mock fetch for x402_pay tool (uses executePayment which calls fetch)
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock getUsdcBalance for x402_check_balance (avoids real RPC in this test file)
vi.mock("@/lib/hot-wallet", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/hot-wallet")>();
  return {
    ...original,
    getUsdcBalance: vi.fn().mockResolvedValue("12.50"),
  };
});

// Mock smart-account signer creation to avoid real RPC calls.
vi.mock("@/lib/smart-account", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/smart-account")>();
  const { privateKeyToAccount } = await import("viem/accounts");
  const { TEST_PRIVATE_KEY: key } = await import("@/test/helpers/crypto");
  const account = privateKeyToAccount(key);
  const mockSigner = {
    address: account.address,
    signTypedData: (args: Parameters<typeof account.signTypedData>[0]) =>
      account.signTypedData(args),
  };
  return {
    ...actual,
    createSmartAccountSigner: vi.fn().mockResolvedValue(mockSigner),
    createSmartAccountSignerFromSerialized: vi.fn().mockResolvedValue(mockSigner),
  };
});

/**
 * V1-format payment requirement with all fields the SDK needs.
 */
const DEFAULT_REQUIREMENT = {
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: "50000", // 0.05 USDC
  resource: "https://api.example.com/resource",
  payTo: ("0x" + "b".repeat(40)) as `0x${string}`,
  maxTimeoutSeconds: 3600,
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  extra: { name: "USD Coin", version: "2" },
};

/**
 * Build a V1-format 402 response.
 */
function make402Response(requirements: object[]): Response {
  const body = {
    x402Version: 1,
    error: "Payment Required",
    accepts: requirements,
  };
  return new Response(JSON.stringify(body), {
    status: 402,
    headers: { "Content-Type": "application/json" },
  });
}

describe("E2E: MCP Tool Pipeline", () => {
  let userId: string;
  let tools: CapturedTool[];

  beforeEach(async () => {
    await resetTestDb();
    const seeded = await seedTestUser();
    userId = seeded.user.id;
    mockFetch.mockReset();

    // Register tools fresh for each test
    const capture = createToolCapture();
    const { registerTools } = await import("@/lib/mcp/register-tools");
    registerTools(capture.server as unknown as Parameters<typeof registerTools>[0], userId);
    tools = capture.tools;
  });

  afterEach(async () => {
    await resetTestDb();
  });

  describe("x402_pay", () => {
    it("should complete a payment and return success response", async () => {
      const txHash = "0x" + "f".repeat(64);

      mockFetch
        .mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: true, data: "paid content" }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-PAYMENT-TX-HASH": txHash,
            },
          }),
        );

      const payTool = findTool(tools, "x402_pay");
      expect(payTool).toBeDefined();
      const result = await payTool!.handler({
        url: "https://api.example.com/resource",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBe(200);
      expect(parsed.data).toEqual({ success: true, data: "paid content" });

      // Verify transaction was logged in DB
      const transactions = await Transaction.find({ userId }).lean();
      expect(transactions).toHaveLength(1);
      expect(transactions[0].amount).toBe(0.05);
      expect(transactions[0].txHash).toBe(txHash);
    });

    it("should return pending_approval when autoSign is false", async () => {
      // Update the seeded policy to use manual approval (autoSign = false)
      const existing = await EndpointPolicy.findOne({ userId }).lean();
      await EndpointPolicy.findByIdAndUpdate(existing!._id, {
        $set: { autoSign: false },
      });

      mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));

      const payTool = findTool(tools, "x402_pay");
      expect(payTool).toBeDefined();
      const result = await payTool!.handler({
        url: "https://api.example.com/resource",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("requires user approval");
      expect(result.content[0].text).toContain("Payment ID:");

      // Verify pending payment was created in DB
      const pending = await PendingPayment.find({ userId }).lean();
      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe("pending");
    });

    it("should return an error for invalid URLs", async () => {
      const payTool = findTool(tools, "x402_pay");
      expect(payTool).toBeDefined();
      const result = await payTool!.handler({
        url: "not-a-url",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Payment failed");
    });

    it("should reject when no active policy exists", async () => {
      // Remove all policies for this user
      await EndpointPolicy.deleteMany({ userId });

      mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));

      const payTool = findTool(tools, "x402_pay");
      expect(payTool).toBeDefined();
      const result = await payTool!.handler({
        url: "https://unknown-host.example.com/resource",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Payment failed");
    });
  });

  describe("x402_check_balance", () => {
    it("should return smart account balance for single and multi-chain queries", async () => {
      const balanceTool = findTool(tools, "x402_check_balance");
      expect(balanceTool).toBeDefined();

      // No chain param → multi-chain array format
      const result = await balanceTool!.handler({});
      expect(result.isError).toBeUndefined();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.balances).toBeDefined();
      expect(parsed.balances).toHaveLength(1);
      expect(parsed.balances[0].address).toBeDefined();
      expect(parsed.balances[0].balance).toBe("12.50");
      expect(parsed.balances[0].chainId).toBeDefined();
      expect(parsed.balances[0].chain).toBeDefined();

      // Single-chain query → returns smart account address and balance
      const singleChainResult = await balanceTool!.handler({ chain: "base-sepolia" });
      expect(singleChainResult.isError).toBeUndefined();

      const singleParsed = JSON.parse(singleChainResult.content[0].text);
      expect(singleParsed.smartAccountAddress).toBeDefined();
      expect(singleParsed.usdcBalance).toBe("12.50");
      expect(singleParsed.chainId).toBe(84532);
    });
  });

  describe("x402_spending_history", () => {
    it("should return transaction history", async () => {
      // Seed some transactions
      await Transaction.create(
        createTestTransaction(userId, {
          amount: 0.05,
          endpoint: "https://api.example.com/a",
        }),
      );
      await Transaction.create(
        createTestTransaction(userId, {
          amount: 0.10,
          endpoint: "https://api.example.com/b",
        }),
      );

      const historyTool = findTool(tools, "x402_spending_history");
      expect(historyTool).toBeDefined();
      const result = await historyTool!.handler({});

      expect(result.isError).toBeUndefined();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(2);
      expect(parsed.transactions).toHaveLength(2);
      expect(parsed.transactions[0].amount).toBeDefined();
      expect(parsed.transactions[0].endpoint).toBeDefined();
      expect(parsed.transactions[0].status).toBe("completed");
    });

    it("should filter transactions by date", async () => {
      // Create an old transaction (simulated by direct DB insert with past date)
      const oldDate = new Date("2020-01-01T00:00:00Z");
      const oldTxData = createTestTransaction(userId, {
        amount: 0.01,
      });
      await Transaction.create({ ...oldTxData, createdAt: oldDate });

      // Create a recent transaction
      await Transaction.create(
        createTestTransaction(userId, {
          amount: 0.02,
        }),
      );

      const historyTool = findTool(tools, "x402_spending_history");
      expect(historyTool).toBeDefined();
      const result = await historyTool!.handler({
        since: "2024-01-01T00:00:00Z",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
    });

    it("should return empty list when no transactions exist", async () => {
      const historyTool = findTool(tools, "x402_spending_history");
      expect(historyTool).toBeDefined();
      const result = await historyTool!.handler({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(0);
      expect(parsed.transactions).toHaveLength(0);
    });
  });

  describe("x402_check_pending", () => {
    it("should return pending payment status", async () => {
      const pendingData = createTestPendingPayment(userId);
      const pending = await PendingPayment.create(pendingData);

      const checkTool = findTool(tools, "x402_check_pending");
      expect(checkTool).toBeDefined();
      const result = await checkTool!.handler({
        paymentId: pending.id,
      });

      expect(result.isError).toBeUndefined();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe(pending.id);
      expect(parsed.status).toBe("pending");
      expect(parsed.amount).toBe(0.05);
      expect(parsed.url).toBe("https://api.example.com/paid-resource");
      expect(parsed.timeRemainingSeconds).toBeGreaterThan(0);
    });

    it("should detect and expire old pending payments", async () => {
      const expiredDate = new Date(Date.now() - 3600_000); // 1 hour ago
      const pendingData = createTestPendingPayment(userId, {
        expiresAt: expiredDate,
      });
      const pending = await PendingPayment.create(pendingData);

      const checkTool = findTool(tools, "x402_check_pending");
      expect(checkTool).toBeDefined();
      const result = await checkTool!.handler({
        paymentId: pending.id,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe("expired");

      // Verify DB was updated
      const updated = await PendingPayment.findById(pending._id).lean();
      expect(updated?.status).toBe("expired");
    });

    it("should return error for non-existent payment ID", async () => {
      const checkTool = findTool(tools, "x402_check_pending");
      expect(checkTool).toBeDefined();
      const result = await checkTool!.handler({
        paymentId: "000000000000000000000099", // valid ObjectId format, doesn't exist
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });
});
