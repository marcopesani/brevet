import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Hex } from "viem";
import { verifyTypedData } from "viem";
import { resetTestDb, seedTestUser } from "@/test/helpers/db";
import { TEST_WALLET_ADDRESS } from "@/test/helpers/crypto";
import { prisma } from "@/lib/db";
import { chainConfig } from "@/lib/chain-config";
import { authorizationTypes } from "@/lib/x402/eip712";
import { parsePaymentRequired } from "@/lib/x402/headers";
// Mock fetch so executePayment can reach endpoints despite URL validation
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("E2E: Full Payment Flow", () => {
  let userId: string;

  /**
   * V1-format payment requirement with all fields the SDK needs.
   */
  const DEFAULT_REQUIREMENT = {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: "50000", // 0.05 USDC
    resource: "https://api.example.com/resource",
    payTo: ("0x" + "b".repeat(40)) as Hex,
    maxTimeoutSeconds: 3600,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    extra: { name: "USD Coin", version: "2" },
  };

  /**
   * Build a V1-format 402 response with requirements in the body.
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

  function make200Response(txHash?: string): Response {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (txHash) {
      headers["X-PAYMENT-TX-HASH"] = txHash;
    }
    return new Response(
      JSON.stringify({ success: true, ...(txHash ? { txHash } : {}) }),
      { status: 200, headers },
    );
  }

  beforeEach(async () => {
    await resetTestDb();
    const seeded = await seedTestUser();
    userId = seeded.user.id;
    mockFetch.mockReset();
  });

  afterEach(async () => {
    await resetTestDb();
  });

  it("should complete full payment pipeline: 402 → parse → sign → pay → 200", async () => {
    const txHash = "0x" + "f".repeat(64);

    // First call returns 402, second call (with payment header) returns 200
    mockFetch
      .mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]))
      .mockResolvedValueOnce(make200Response(txHash));

    const { executePayment } = await import("@/lib/x402/payment");
    const result = await executePayment(
      "https://api.example.com/resource",
      userId,
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.signingStrategy).toBe("hot_wallet");

    // Verify that the second fetch call included a payment header
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondCall = mockFetch.mock.calls[1];
    const headers = secondCall[1]?.headers;
    expect(headers).toBeDefined();

    // V1 uses X-PAYMENT header
    const paymentHeaderValue = headers["X-PAYMENT"] ?? headers["PAYMENT-SIGNATURE"];
    expect(paymentHeaderValue).toBeDefined();
    expect(typeof paymentHeaderValue).toBe("string");

    // Decode the payment header and verify EIP-712 signature
    const decoded = JSON.parse(atob(paymentHeaderValue));
    expect(decoded.x402Version).toBe(1);
    expect(decoded.scheme).toBe("exact");

    const { signature, authorization } = decoded.payload;

    // Verify the signature recovers to our test wallet address
    const isValid = await verifyTypedData({
      address: TEST_WALLET_ADDRESS,
      domain: chainConfig.usdcDomain,
      types: authorizationTypes,
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from,
        to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      },
      signature: signature as Hex,
    });
    expect(isValid).toBe(true);

    // Verify the authorization fields are sensible
    expect(authorization.from.toLowerCase()).toBe(
      TEST_WALLET_ADDRESS.toLowerCase(),
    );
    expect(authorization.to.toLowerCase()).toBe(
      DEFAULT_REQUIREMENT.payTo.toLowerCase(),
    );
    expect(BigInt(authorization.value)).toBe(BigInt(50000));
  });

  it("should log a transaction in the database after successful payment", async () => {
    const txHash = "0x" + "f".repeat(64);

    mockFetch
      .mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]))
      .mockResolvedValueOnce(make200Response(txHash));

    const { executePayment } = await import("@/lib/x402/payment");
    await executePayment("https://api.example.com/resource", userId);

    // Verify transaction was recorded
    const transactions = await prisma.transaction.findMany({
      where: { userId },
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].amount).toBe(0.05); // 50000 / 1e6
    expect(transactions[0].endpoint).toBe(
      "https://api.example.com/resource",
    );
    expect(transactions[0].status).toBe("completed");
    expect(transactions[0].type).toBe("payment");
    expect(transactions[0].network).toBe("base-sepolia");
    expect(transactions[0].txHash).toBe(txHash);
  });

  it("should reject payment when amount exceeds WC approval limit", async () => {
    // 10 USDC = 10_000_000 — exceeds the wcApprovalLimit of 5.0
    const bigRequirement = {
      ...DEFAULT_REQUIREMENT,
      maxAmountRequired: "10000000",
    };

    mockFetch.mockResolvedValueOnce(make402Response([bigRequirement]));

    const { executePayment } = await import("@/lib/x402/payment");
    const result = await executePayment(
      "https://api.example.com/resource",
      userId,
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.error).toContain("exceeds maximum approval limit");
  });

  it("should return pending_approval when amount exceeds per-request limit but within WC limit", async () => {
    // 0.5 USDC = 500000 — exceeds perRequestLimit (0.1) but under wcApprovalLimit (5.0)
    const mediumRequirement = {
      ...DEFAULT_REQUIREMENT,
      maxAmountRequired: "500000",
    };

    mockFetch.mockResolvedValueOnce(make402Response([mediumRequirement]));

    const { executePayment } = await import("@/lib/x402/payment");
    const result = await executePayment(
      "https://api.example.com/resource",
      userId,
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe("pending_approval");
    expect(result.signingStrategy).toBe("walletconnect");
    expect(result.amount).toBe(0.5);
    expect(result.paymentRequirements).toBeDefined();

    // Verify no transaction was created (pending, not completed)
    const transactions = await prisma.transaction.findMany({
      where: { userId },
    });
    expect(transactions).toHaveLength(0);
  });

  it("should handle non-402 response (pass-through)", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: "free content" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { executePayment } = await import("@/lib/x402/payment");
    const result = await executePayment(
      "https://api.example.com/free",
      userId,
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe("completed");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should reject 402 with no payment requirements", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Payment Required", {
        status: 402,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    const { executePayment } = await import("@/lib/x402/payment");
    const result = await executePayment(
      "https://api.example.com/resource",
      userId,
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.error).toContain("no valid payment requirements");
  });

  it("should parse payment requirements from V1 402 response body", () => {
    const response = make402Response([DEFAULT_REQUIREMENT]);
    const body = {
      x402Version: 1,
      error: "Payment Required",
      accepts: [DEFAULT_REQUIREMENT],
    };

    const requirements = parsePaymentRequired(response, body);

    expect(requirements).not.toBeNull();
    expect(requirements!.accepts).toHaveLength(1);
    expect(requirements!.accepts[0].scheme).toBe("exact");
    expect(requirements!.accepts[0].network).toBe("base-sepolia");
    expect((requirements!.accepts[0] as any).maxAmountRequired).toBe("50000");
    expect(requirements!.accepts[0].payTo).toBe(DEFAULT_REQUIREMENT.payTo);
  });

  it("should enforce hourly spending limits", async () => {
    // Seed a recent transaction that nearly exhausts hourly limit (0.96 of 1.0)
    await prisma.transaction.create({
      data: {
        amount: 0.96,
        endpoint: "https://api.example.com/other",
        txHash: "0x" + "d".repeat(64),
        network: "base-sepolia",
        status: "completed",
        type: "payment",
        userId,
      },
    });

    // Try a 0.05 USDC payment — should exceed hourly limit (0.96 + 0.05 = 1.01 > 1.0)
    mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));

    const { executePayment } = await import("@/lib/x402/payment");
    const result = await executePayment(
      "https://api.example.com/resource",
      userId,
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.error).toContain("Hourly spend");
  });
});
