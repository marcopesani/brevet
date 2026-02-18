import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetTestDb, seedTestUser } from "../../../test/helpers/db";
import { executePayment } from "../payment";
import { Transaction } from "../../models/transaction";
import { HotWallet } from "../../models/hot-wallet";
import { EndpointPolicy } from "../../models/endpoint-policy";
import { createTestHotWallet, createTestEndpointPolicy } from "../../../test/helpers/fixtures";
import mongoose from "mongoose";

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
  registerExactEvmScheme: vi.fn().mockImplementation((client: Record<string, unknown> & { registerV1: (network: string, handler: unknown) => void }) => {
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

  it("handles 402 with unsupported network", async () => {
    const requirement = {
      ...DEFAULT_REQUIREMENT,
      scheme: "subscription",
      network: "solana:mainnet",
    };
    mockFetch.mockResolvedValueOnce(make402Response([requirement]));

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("accepted networks are supported");
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

    const tx = await Transaction.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      endpoint: "https://api.example.com/resource",
    }).lean();
    expect(tx).not.toBeNull();
    expect(tx!.status).toBe("completed");
    expect(tx!.txHash).toBe(txHash);
    expect(tx!.amount).toBe(0.05);
    expect(tx!.chainId).toBe(84532);
  });

  it("rejects when no hot wallet exists", async () => {
    await HotWallet.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });

    mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));

    const result = await executePayment("https://api.example.com/resource", userId);

    // No hot wallet → returns pending_approval for WalletConnect with chainId
    expect(result.success).toBe(false);
    expect(result.status).toBe("pending_approval");
    expect(result.signingStrategy).toBe("walletconnect");
    expect(result.chainId).toBe(84532);
  });

  it("rejects when policy denies the payment (no active policy)", async () => {
    await EndpointPolicy.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });

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

    const tx = await Transaction.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      endpoint: "https://api.example.com/resource",
    }).lean();
    expect(tx).not.toBeNull();
    expect(tx!.status).toBe("failed");
    expect(tx!.errorMessage).toContain("server responded with 500");
    expect(tx!.responseStatus).toBe(500);
  });

  it("stores responseStatus without errorMessage on successful payment", async () => {
    const txHash = "0x" + "d".repeat(64);

    mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));
    mockFetch.mockResolvedValueOnce(
      make200Response({ success: true }, { "X-PAYMENT-TX-HASH": txHash }),
    );

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(true);

    const tx = await Transaction.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      endpoint: "https://api.example.com/resource",
    }).lean();
    expect(tx).not.toBeNull();
    expect(tx!.status).toBe("completed");
    expect(tx!.responseStatus).toBe(200);
    expect(tx!.errorMessage).toBeNull();
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
    // Called twice: once during selectBestChain, once during balance verification
    const { getUsdcBalance } = await import("@/lib/hot-wallet");
    vi.mocked(getUsdcBalance)
      .mockResolvedValueOnce("0.001000")  // selectBestChain balance check
      .mockResolvedValueOnce("0.001000"); // signing flow balance check

    mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("pending_approval");
    expect(result.signingStrategy).toBe("walletconnect");
    expect(result.paymentRequirements).toBeDefined();
    expect(result.chainId).toBe(84532);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns walletconnect when payFromHotWallet is false", async () => {
    await EndpointPolicy.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId), endpointPattern: "https://api.example.com" },
      { $set: { payFromHotWallet: false } },
    );

    mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));

    const result = await executePayment("https://api.example.com/resource", userId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("pending_approval");
    expect(result.signingStrategy).toBe("walletconnect");
    expect(result.paymentRequirements).toBeDefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  describe("multi-chain selection", () => {
    it("selects chain with highest balance when multiple networks offered", async () => {
      const { getUsdcBalance } = await import("@/lib/hot-wallet");

      // Create hot wallet + policy on Arbitrum Sepolia (421614)
      const arbWalletData = createTestHotWallet(userId, { chainId: 421614 });
      await HotWallet.create(arbWalletData);
      await EndpointPolicy.create(
        createTestEndpointPolicy(userId, { chainId: 421614 }),
      );

      // Mock balance: Base Sepolia has 10 USDC, Arbitrum Sepolia has 50 USDC
      vi.mocked(getUsdcBalance)
        .mockResolvedValueOnce("10.000000")   // Base Sepolia balance (checked during chain selection)
        .mockResolvedValueOnce("50.000000")   // Arbitrum Sepolia balance (checked during chain selection)
        .mockResolvedValueOnce("50.000000");  // Balance re-check in signing flow

      const multiNetworkRequirement421614 = {
        ...DEFAULT_REQUIREMENT,
        network: "eip155:421614",
        asset: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
      };

      mockFetch.mockResolvedValueOnce(
        make402Response([DEFAULT_REQUIREMENT, multiNetworkRequirement421614]),
      );
      mockFetch.mockResolvedValueOnce(
        make200Response({ success: true }, { "X-PAYMENT-TX-HASH": "0x" + "e".repeat(64) }),
      );

      const result = await executePayment("https://api.example.com/resource", userId);

      expect(result.success).toBe(true);
      expect(result.status).toBe("completed");

      // Transaction should be stored with Arbitrum Sepolia chainId (highest balance)
      const tx = await Transaction.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        endpoint: "https://api.example.com/resource",
      }).lean();
      expect(tx).not.toBeNull();
      expect(tx!.chainId).toBe(421614);
    });

    it("falls back to WalletConnect when no hot wallet on any accepted chain", async () => {
      // Delete default hot wallet
      await HotWallet.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });

      // Endpoint only accepts Arbitrum Sepolia (421614) — user has no wallet there
      const arbRequirement = {
        ...DEFAULT_REQUIREMENT,
        network: "eip155:421614",
        asset: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
      };
      mockFetch.mockResolvedValueOnce(make402Response([arbRequirement]));

      const result = await executePayment("https://api.example.com/resource", userId);

      expect(result.success).toBe(false);
      expect(result.status).toBe("pending_approval");
      expect(result.signingStrategy).toBe("walletconnect");
      expect(result.chainId).toBe(421614);
    });

    it("uses explicit chainId when provided", async () => {
      const txHash = "0x" + "f".repeat(64);

      mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));
      mockFetch.mockResolvedValueOnce(
        make200Response({ success: true }, { "X-PAYMENT-TX-HASH": txHash }),
      );

      const result = await executePayment(
        "https://api.example.com/resource",
        userId,
        undefined,
        84532, // explicit chain
      );

      expect(result.success).toBe(true);

      const tx = await Transaction.findOne({
        userId: new mongoose.Types.ObjectId(userId),
      }).lean();
      expect(tx!.chainId).toBe(84532);
    });

    it("rejects when explicit chainId is not accepted by endpoint", async () => {
      mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));

      const result = await executePayment(
        "https://api.example.com/resource",
        userId,
        undefined,
        42161, // Arbitrum mainnet — not in accepts (which has 84532)
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not accepted by this endpoint");
    });

    it("rejects when explicit chainId is not supported", async () => {
      mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));

      const result = await executePayment(
        "https://api.example.com/resource",
        userId,
        undefined,
        999999, // unsupported chain
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("is not supported");
    });

    it("stores chainId on transaction for default chain payment", async () => {
      const txHash = "0x" + "a".repeat(64);

      mockFetch.mockResolvedValueOnce(make402Response([DEFAULT_REQUIREMENT]));
      mockFetch.mockResolvedValueOnce(
        make200Response({ success: true }, { "X-PAYMENT-TX-HASH": txHash }),
      );

      await executePayment("https://api.example.com/resource", userId);

      const tx = await Transaction.findOne({
        userId: new mongoose.Types.ObjectId(userId),
      }).lean();
      expect(tx).not.toBeNull();
      expect(tx!.chainId).toBe(84532);
    });
  });

  describe("SSRF hardening", () => {
    describe("H2: full loopback range", () => {
      it("rejects 127.0.0.2", async () => {
        const result = await executePayment("http://127.0.0.2/", userId);
        expect(result.success).toBe(false);
        expect(result.error).toContain("private");
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it("rejects 127.1.1.1", async () => {
        const result = await executePayment("http://127.1.1.1/", userId);
        expect(result.success).toBe(false);
        expect(result.error).toContain("private");
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it("rejects 127.255.255.255", async () => {
        const result = await executePayment("http://127.255.255.255/", userId);
        expect(result.success).toBe(false);
        expect(result.error).toContain("private");
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it("still blocks 127.0.0.1", async () => {
        const result = await executePayment("http://127.0.0.1/", userId);
        expect(result.success).toBe(false);
        expect(result.error).toContain("private");
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });
  });
});
