import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "../../db";
import { resetTestDb, seedTestUser } from "../../../test/helpers/db";
import { executePayment } from "../payment";

// Mock global fetch to avoid real network calls and bypass URL validation on loopback
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock getUsdcBalance to avoid real RPC calls during the hot wallet balance check
vi.mock("@/lib/hot-wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hot-wallet")>();
  return {
    ...actual,
    getUsdcBalance: vi.fn().mockResolvedValue("1000.000000"), // Default: plenty of balance
  };
});

// Mock registerExactEvmScheme to register a mock V1 handler for eip155:84532.
// The real SDK registers V1 handlers for plain network names (e.g. "base-sepolia")
// but not for EIP-155 format strings. This mock registers a handler that returns
// a mock payment payload so createPaymentPayload succeeds in tests.
vi.mock("@x402/evm/exact/client", () => ({
  registerExactEvmScheme: vi.fn().mockImplementation((client: any) => {
    // Register a mock V1 scheme for eip155:84532 so createPaymentPayload works
    client.registerV1("eip155:84532", {
      scheme: "exact",
      createPaymentPayload: vi.fn().mockResolvedValue({
        x402Version: 1,
        scheme: "exact",
        network: "eip155:84532",
        payload: {
          signature: "0x" + "ab".repeat(65),
          authorization: {
            from: "0x" + "aa".repeat(20),
            to: "0x" + "bb".repeat(20),
            value: "50000",
            validAfter: "0",
            validBefore: String(Math.floor(Date.now() / 1000) + 3600),
            nonce: "0x" + "00".repeat(32),
          },
        },
      }),
    });
    return client;
  }),
}));

/**
 * Build a V1-format 402 response with payment requirements in the body.
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

const DEFAULT_REQUIREMENT = {
  scheme: "exact",
  network: "eip155:84532",
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
      scheme: "subscription",
      network: "solana:mainnet",
    };
    mockFetch.mockResolvedValueOnce(make402Response([requirement]));

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("is not supported");
  });

  it("completes payment flow: 402 → sign → re-request → 200", async () => {
    const txHash = "0x" + "a".repeat(64);

    mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));
    mockFetch.mockResolvedValueOnce(
      make200Response({ success: true, txHash }, { "X-PAYMENT-TX-HASH": txHash }),
    );

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.signingStrategy).toBe("hot_wallet");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const secondCall = mockFetch.mock.calls[1];
    const headers = secondCall[1]?.headers;
    expect(headers).toBeDefined();
    const hasPaymentHeader =
      "X-PAYMENT" in headers || "PAYMENT-SIGNATURE" in headers;
    expect(hasPaymentHeader).toBe(true);

    const tx = await prisma.transaction.findFirst({
      where: { userId, endpoint: "https://api.example.com/resource" },
    });
    expect(tx).not.toBeNull();
    expect(tx!.status).toBe("completed");
    expect(tx!.txHash).toBe(txHash);
    expect(tx!.amount).toBe(0.05);
  });

  it("rejects when no hot wallet exists", async () => {
    await prisma.hotWallet.deleteMany({ where: { userId } });

    mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No hot wallet found");
  });

  it("rejects when policy denies the payment (no active policy)", async () => {
    await prisma.endpointPolicy.deleteMany({ where: { userId } });

    mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));

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

    mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));
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

    const [firstUrl, firstInit] = mockFetch.mock.calls[0];
    expect(firstUrl).toBe("https://api.example.com/resource");
    expect(firstInit.method).toBe("POST");
    expect(firstInit.body).toBe(JSON.stringify({ action: "create", data: "test" }));
    expect(firstInit.headers?.["Content-Type"]).toBe("application/json");

    const [secondUrl, secondInit] = mockFetch.mock.calls[1];
    expect(secondUrl).toBe("https://api.example.com/resource");
    expect(secondInit.method).toBe("POST");
    expect(secondInit.body).toBe(JSON.stringify({ action: "create", data: "test" }));
    expect(secondInit.headers?.["Content-Type"]).toBe("application/json");

    const hasPaymentHeader =
      "X-PAYMENT" in secondInit.headers || "PAYMENT-SIGNATURE" in secondInit.headers;
    expect(hasPaymentHeader).toBe(true);
  });

  it("uses GET by default when no method is specified", async () => {
    mockFetch.mockResolvedValueOnce(make200Response({ data: "ok" }));

    const result = await executePayment("https://api.example.com/free", userId);

    expect(result.success).toBe(true);
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("falls back to walletconnect when hot wallet balance is insufficient", async () => {
    // Override getUsdcBalance to return a very low balance
    const { getUsdcBalance } = await import("@/lib/hot-wallet");
    vi.mocked(getUsdcBalance).mockResolvedValueOnce("0.001000");

    mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("pending_approval");
    expect(result.signingStrategy).toBe("walletconnect");
    expect(result.paymentRequirements).toBeDefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns walletconnect when payFromHotWallet is false", async () => {
    await prisma.endpointPolicy.update({
      where: { userId_endpointPattern: { userId, endpointPattern: "https://api.example.com" } },
      data: { payFromHotWallet: false },
    });

    mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("pending_approval");
    expect(result.signingStrategy).toBe("walletconnect");
    expect(result.paymentRequirements).toBeDefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
