import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "../../db";
import { resetTestDb, seedTestUser } from "../../../test/helpers/db";
import { createTestTransaction } from "../../../test/helpers/fixtures";
import { executePayment } from "../payment";

// Mock global fetch to avoid real network calls and bypass URL validation on loopback
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

/**
 * Build a V1-format 402 response with payment requirements in the body.
 *
 * The SDK's `getPaymentRequiredResponse` checks:
 *   1. PAYMENT-REQUIRED header (V2, base64)
 *   2. Body with `x402Version: 1` and `accepts` array (V1)
 *
 * We use V1 body format here since the test private key can sign V1 EIP-3009
 * payloads via the registered ExactEvmSchemeV1.
 */
function make402Response(paymentRequirements: object[]): Response {
  const body = {
    x402Version: 1,
    error: "Payment Required",
    accepts: paymentRequirements,
  };
  return new Response(JSON.stringify(body), {
    status: 402,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function make200Response(body: object, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

/**
 * V1-format payment requirement with all fields the SDK's ExactEvmSchemeV1 needs.
 *
 * - `network`: plain name for V1 (e.g. "base-sepolia")
 * - `maxAmountRequired`: amount in smallest unit (V1 field)
 * - `maxTimeoutSeconds`: validity window (V1 field)
 * - `extra.name` / `extra.version`: EIP-712 domain for USDC
 * - `asset`: USDC contract on Base Sepolia
 */
const DEFAULT_REQUIREMENT = {
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: "50000", // 0.05 USDC (6 decimals)
  resource: "https://api.example.com/resource",
  payTo: ("0x" + "b".repeat(40)) as `0x${string}`,
  maxTimeoutSeconds: 3600,
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  extra: { name: "USD Coin", version: "2" },
};

describe("executePayment", () => {
  let userId: string;

  beforeEach(async () => {
    await resetTestDb();
    const { user } = await seedTestUser();
    userId = user.id;
    mockFetch.mockReset();
  });

  afterEach(async () => {
    await resetTestDb();
  });

  it("returns response directly when server returns 200 (non-402)", async () => {
    mockFetch.mockResolvedValueOnce(make200Response({ data: "free content" }));

    const result = await executePayment("https://api.example.com/free", userId);

    expect(result.success).toBe(true);
    expect(result.status).toBe("completed");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid URLs", async () => {
    const result = await executePayment("not-a-url", userId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.error).toContain("URL validation failed");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects non-http protocols", async () => {
    const result = await executePayment("ftp://example.com/file", userId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported protocol");
  });

  it("rejects localhost URLs", async () => {
    const result = await executePayment("http://localhost:3000/api", userId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("localhost");
  });

  it("rejects private IP addresses", async () => {
    const result = await executePayment("http://192.168.1.1/api", userId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("private");
  });

  it("handles 402 with no payment requirements headers", async () => {
    // 402 response with no V1 body or V2 header
    mockFetch.mockResolvedValueOnce(
      new Response("Payment Required", { status: 402 }),
    );

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("no valid payment requirements");
  });

  it("handles 402 with unsupported scheme/network", async () => {
    const requirement = {
      ...DEFAULT_REQUIREMENT,
      scheme: "subscription", // Not "exact"
      network: "solana:mainnet", // Not an EVM network
    };
    mockFetch.mockResolvedValueOnce(make402Response([requirement]));

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(false);
    // SDK throws when no registered scheme matches the requirement
    expect(result.error).toContain("Failed to create payment");
  });

  it("completes payment flow: 402 → sign → re-request → 200", async () => {
    const txHash = "0x" + "a".repeat(64);

    // First call: 402 with V1 body requirements
    mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));
    // Second call: 200 with tx hash
    mockFetch.mockResolvedValueOnce(
      make200Response({ success: true, txHash }, { "X-PAYMENT-TX-HASH": txHash }),
    );

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.signingStrategy).toBe("hot_wallet");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify the second request includes the payment signature header
    // V1 uses X-PAYMENT header with base64-encoded payload
    const secondCall = mockFetch.mock.calls[1];
    const headers = secondCall[1]?.headers;
    expect(headers).toBeDefined();
    const hasPaymentHeader =
      "X-PAYMENT" in headers || "PAYMENT-SIGNATURE" in headers;
    expect(hasPaymentHeader).toBe(true);

    // Verify transaction was logged in the database
    const tx = await prisma.transaction.findFirst({
      where: { userId, endpoint: "https://api.example.com/resource" },
    });
    expect(tx).not.toBeNull();
    expect(tx!.status).toBe("completed");
    expect(tx!.txHash).toBe(txHash);
    expect(tx!.amount).toBe(0.05);
  });

  it("rejects when no hot wallet exists", async () => {
    // Delete the hot wallet
    await prisma.hotWallet.deleteMany({ where: { userId } });

    mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No hot wallet found");
  });

  it("returns pending_approval when amount exceeds per-request limit", async () => {
    // Default perRequestLimit is 0.1 USDC = 100000 wei (6 decimals)
    // Set maxAmountRequired to 200000 = 0.2 USDC, which is above per-request but under WC limit
    const bigRequirement = {
      ...DEFAULT_REQUIREMENT,
      maxAmountRequired: "200000", // 0.2 USDC
    };
    mockFetch.mockResolvedValueOnce(make402Response([bigRequirement]));

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("pending_approval");
    expect(result.signingStrategy).toBe("walletconnect");
    expect(result.amount).toBe(0.2);
    expect(result.paymentRequirements).toBeDefined();
    // Only one fetch call — no re-request for WC path
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects when policy denies the payment", async () => {
    // Set amount above WC approval limit (default 5.0 USDC = 5000000 wei)
    const hugeRequirement = {
      ...DEFAULT_REQUIREMENT,
      maxAmountRequired: "6000000", // 6.0 USDC > 5.0 WC limit
    };
    mockFetch.mockResolvedValueOnce(make402Response([hugeRequirement]));

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.error).toContain("Policy denied");
  });

  it("logs failed transaction when paid request returns non-200", async () => {
    mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));
    mockFetch.mockResolvedValueOnce(
      new Response("Server Error", { status: 500 }),
    );

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("server responded with 500");

    const tx = await prisma.transaction.findFirst({
      where: { userId, endpoint: "https://api.example.com/resource" },
    });
    expect(tx).not.toBeNull();
    expect(tx!.status).toBe("failed");
  });

  it("preserves POST method and body across 402 payment flow", async () => {
    const txHash = "0x" + "c".repeat(64);

    // First call: 402 with V1 body requirements
    mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));
    // Second call: 200 with tx hash
    mockFetch.mockResolvedValueOnce(
      make200Response({ created: true }, { "X-PAYMENT-TX-HASH": txHash }),
    );

    const result = await executePayment(
      "https://api.example.com/resource",
      userId,
      {
        method: "POST",
        body: JSON.stringify({ action: "create", data: "test" }),
        headers: { "Content-Type": "application/json" },
      },
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe("completed");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify the initial request used POST with the body and headers
    const [firstUrl, firstInit] = mockFetch.mock.calls[0];
    expect(firstUrl).toBe("https://api.example.com/resource");
    expect(firstInit.method).toBe("POST");
    expect(firstInit.body).toBe(JSON.stringify({ action: "create", data: "test" }));
    expect(firstInit.headers?.["Content-Type"]).toBe("application/json");

    // Verify the paid retry also used POST with the same body and original headers
    const [secondUrl, secondInit] = mockFetch.mock.calls[1];
    expect(secondUrl).toBe("https://api.example.com/resource");
    expect(secondInit.method).toBe("POST");
    expect(secondInit.body).toBe(JSON.stringify({ action: "create", data: "test" }));
    expect(secondInit.headers?.["Content-Type"]).toBe("application/json");

    // Verify payment headers were added to the retry
    const hasPaymentHeader =
      "X-PAYMENT" in secondInit.headers || "PAYMENT-SIGNATURE" in secondInit.headers;
    expect(hasPaymentHeader).toBe(true);
  });

  it("uses GET by default when no method is specified", async () => {
    mockFetch.mockResolvedValueOnce(make200Response({ data: "ok" }));

    const result = await executePayment("https://api.example.com/free", userId);

    expect(result.success).toBe(true);
    // Default should be GET — verify no body was sent
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("rejects when hourly spend limit is exceeded", async () => {
    // Seed transactions close to the hourly limit
    await prisma.transaction.create({
      data: createTestTransaction(userId, {
        id: "tx-hour-fill",
        amount: 0.95,
        status: "completed",
      }),
    });

    // 0.95 + 0.06 = 1.01 > 1.0 hourly limit
    const overLimitReq = {
      ...DEFAULT_REQUIREMENT,
      maxAmountRequired: "60000", // 0.06 USDC
    };
    mockFetch.mockResolvedValueOnce(make402Response([overLimitReq]));

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Policy denied");
  });
});
