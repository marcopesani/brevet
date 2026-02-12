import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetTestDb, seedTestUser } from "@/test/helpers/db";
import { createTestTransaction, createTestPendingPayment } from "@/test/helpers/fixtures";
import { prisma } from "@/lib/db";
import type { Hex } from "viem";

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
    const { registerTools } = await import("@/lib/mcp/tools");
    registerTools(capture.server as any, userId);
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
      const transactions = await prisma.transaction.findMany({
        where: { userId },
      });
      expect(transactions).toHaveLength(1);
      expect(transactions[0].amount).toBe(0.05);
      expect(transactions[0].txHash).toBe(txHash);
    });

    it("should create a pending payment when amount exceeds per-request limit", async () => {
      // 0.5 USDC exceeds perRequestLimit (0.1) → pending_approval
      const bigRequirement = {
        ...DEFAULT_REQUIREMENT,
        maxAmountRequired: "500000",
      };

      mockFetch.mockResolvedValueOnce(make402Response([bigRequirement]));

      const payTool = findTool(tools, "x402_pay");
      expect(payTool).toBeDefined();
      const result = await payTool!.handler({
        url: "https://api.example.com/resource",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("requires user approval");
      expect(result.content[0].text).toContain("Payment ID:");

      // Verify pending payment was created in DB
      const pending = await prisma.pendingPayment.findMany({
        where: { userId },
      });
      expect(pending).toHaveLength(1);
      expect(pending[0].amount).toBe(0.5);
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

    it("should return an error when policy rejects payment", async () => {
      // 10 USDC exceeds wcApprovalLimit (5.0)
      const hugeRequirement = {
        ...DEFAULT_REQUIREMENT,
        maxAmountRequired: "10000000",
      };

      mockFetch.mockResolvedValueOnce(make402Response([hugeRequirement]));

      const payTool = findTool(tools, "x402_pay");
      expect(payTool).toBeDefined();
      const result = await payTool!.handler({
        url: "https://api.example.com/resource",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Policy denied");
    });
  });

  describe("x402_check_balance", () => {
    it("should return wallet balance and budget info", async () => {
      const balanceTool = findTool(tools, "x402_check_balance");
      expect(balanceTool).toBeDefined();
      const result = await balanceTool!.handler({});

      expect(result.isError).toBeUndefined();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.walletAddress).toBeDefined();
      expect(parsed.usdcBalance).toBe("12.50");
      expect(parsed.budgetRemaining).toBeDefined();
      expect(parsed.budgetRemaining.perRequest).toBe(0.1);
      expect(parsed.budgetRemaining.hourly).toBe(1.0);
      expect(parsed.budgetRemaining.daily).toBe(10.0);
    });

    it("should reflect recent spending in remaining budget", async () => {
      // Create a recent transaction of 0.5 USDC
      await prisma.transaction.create({
        data: createTestTransaction(userId, {
          id: "tx-budget-1",
          amount: 0.5,
          status: "completed",
        }),
      });

      const balanceTool = findTool(tools, "x402_check_balance");
      expect(balanceTool).toBeDefined();
      const result = await balanceTool!.handler({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.budgetRemaining.hourly).toBe(0.5); // 1.0 - 0.5
      expect(parsed.budgetRemaining.daily).toBe(9.5); // 10.0 - 0.5
    });
  });

  describe("x402_spending_history", () => {
    it("should return transaction history", async () => {
      // Seed some transactions
      await prisma.transaction.create({
        data: createTestTransaction(userId, {
          id: "tx-hist-1",
          amount: 0.05,
          endpoint: "https://api.example.com/a",
        }),
      });
      await prisma.transaction.create({
        data: createTestTransaction(userId, {
          id: "tx-hist-2",
          amount: 0.10,
          endpoint: "https://api.example.com/b",
        }),
      });

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
      await prisma.transaction.create({
        data: {
          ...createTestTransaction(userId, {
            id: "tx-old",
            amount: 0.01,
          }),
          createdAt: oldDate,
        },
      });

      // Create a recent transaction
      await prisma.transaction.create({
        data: createTestTransaction(userId, {
          id: "tx-new",
          amount: 0.02,
        }),
      });

      const historyTool = findTool(tools, "x402_spending_history");
      expect(historyTool).toBeDefined();
      const result = await historyTool!.handler({
        since: "2024-01-01T00:00:00Z",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.transactions[0].id).toBe("tx-new");
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
      const pending = await prisma.pendingPayment.create({
        data: pendingData,
      });

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
      const pending = await prisma.pendingPayment.create({
        data: pendingData,
      });

      const checkTool = findTool(tools, "x402_check_pending");
      expect(checkTool).toBeDefined();
      const result = await checkTool!.handler({
        paymentId: pending.id,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe("expired");

      // Verify DB was updated
      const updated = await prisma.pendingPayment.findUnique({
        where: { id: pending.id },
      });
      expect(updated?.status).toBe("expired");
    });

    it("should return error for non-existent payment ID", async () => {
      const checkTool = findTool(tools, "x402_check_pending");
      expect(checkTool).toBeDefined();
      const result = await checkTool!.handler({
        paymentId: "non-existent-id",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });
});
