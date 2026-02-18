import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Hex } from "viem";
import { resetTestDb, seedTestUser } from "@/test/helpers/db";
import { TEST_WALLET_ADDRESS } from "@/test/helpers/crypto";
import { chainConfig } from "@/lib/chain-config";
import { Transaction } from "@/lib/models/transaction";
import {
  parsePaymentRequired,
  extractSettleResponse,
  extractTxHashFromResponse,
} from "@/lib/x402/headers";
import { createSigningRequest } from "@/lib/walletconnect-signer";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock getUsdcBalance — individual tests override as needed
const mockGetUsdcBalance = vi.fn().mockResolvedValue("1000.000000");

// Mock viem wallet/public clients for withdrawal tests
const mockWriteContract = vi.fn();

vi.mock("@/lib/hot-wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hot-wallet")>();
  return {
    ...actual,
    getUsdcBalance: (...args: Parameters<typeof actual.getUsdcBalance>) =>
      mockGetUsdcBalance(...args),
  };
});

// V2-format PaymentRequired for header-based tests
const V2_REQUIREMENT = {
  scheme: "exact",
  network: "eip155:84532" as const,
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  amount: "50000",
  payTo: ("0x" + "b".repeat(40)) as Hex,
  maxTimeoutSeconds: 3600,
  extra: { name: "USD Coin", version: "2" },
};

const V2_PAYMENT_REQUIRED = {
  x402Version: 2,
  error: "Payment Required",
  resource: { url: "https://api.example.com/resource" },
  accepts: [V2_REQUIREMENT],
};

// V1-format requirement (uses "base-sepolia" network string)
const V1_REQUIREMENT = {
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: "50000",
  resource: "https://api.example.com/resource",
  payTo: ("0x" + "b".repeat(40)) as Hex,
  maxTimeoutSeconds: 3600,
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  extra: { name: "USD Coin", version: "2" },
};

/**
 * Build a V2-format 402 response with requirements in the PAYMENT-REQUIRED header.
 */
function makeV2_402Response(paymentRequired: object): Response {
  const encoded = btoa(JSON.stringify(paymentRequired));
  return new Response("Payment Required", {
    status: 402,
    headers: {
      "Content-Type": "text/plain",
      "PAYMENT-REQUIRED": encoded,
    },
  });
}

/**
 * Build a V1-format 402 response with requirements in the body.
 */
function makeV1_402Response(requirements: object[]): Response {
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

function make200Response(
  headers?: Record<string, string>,
  body?: object,
): Response {
  return new Response(JSON.stringify(body ?? { success: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

describe("E2E: Crypto Operations", () => {
  beforeEach(async () => {
    await resetTestDb();
    mockFetch.mockReset();
    mockGetUsdcBalance.mockResolvedValue("1000.000000");
    mockWriteContract.mockReset();
  });

  afterEach(async () => {
    await resetTestDb();
  });

  // ─── 1. V2 Payment Header Parsing ──────────────────────────────────────────
  describe("V2 Payment Header Parsing", () => {
    it("should parse payment requirements from PAYMENT-REQUIRED header (V2 format)", () => {
      const response = makeV2_402Response(V2_PAYMENT_REQUIRED);

      const result = parsePaymentRequired(response);

      expect(result).not.toBeNull();
      expect(result!.x402Version).toBe(2);
      expect(result!.accepts).toHaveLength(1);
      expect(result!.accepts[0].scheme).toBe("exact");
      expect(result!.accepts[0].network).toBe("eip155:84532");
      expect(result!.accepts[0].amount).toBe("50000");
      expect(result!.accepts[0].payTo).toBe(V2_REQUIREMENT.payTo);
    });

    it("should prefer V2 header over V1 body when both are present", () => {
      // Response with V2 header AND V1 body
      const v2Encoded = btoa(JSON.stringify(V2_PAYMENT_REQUIRED));
      const v1Body = {
        x402Version: 1,
        error: "Payment Required",
        accepts: [V1_REQUIREMENT],
      };
      const response = new Response(JSON.stringify(v1Body), {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "PAYMENT-REQUIRED": v2Encoded,
        },
      });

      const result = parsePaymentRequired(response, v1Body);

      // V2 header should take precedence — x402Version should be 2
      expect(result).not.toBeNull();
      expect(result!.x402Version).toBe(2);
    });

    it("should return null for invalid PAYMENT-REQUIRED header", () => {
      const response = new Response("Payment Required", {
        status: 402,
        headers: {
          "Content-Type": "text/plain",
          "PAYMENT-REQUIRED": "not-valid-base64!!!",
        },
      });

      const result = parsePaymentRequired(response);
      expect(result).toBeNull();
    });
  });

  // ─── 2. Settlement Response Extraction ─────────────────────────────────────
  describe("Settlement Response Extraction", () => {
    const SETTLE_RESPONSE = {
      success: true,
      transaction: "0x" + "a".repeat(64),
      network: "eip155:84532",
    };

    it("should extract settle response from PAYMENT-RESPONSE header", () => {
      const encoded = btoa(JSON.stringify(SETTLE_RESPONSE));
      const response = new Response("", {
        status: 200,
        headers: { "PAYMENT-RESPONSE": encoded },
      });

      const result = extractSettleResponse(response);

      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(result!.transaction).toBe(SETTLE_RESPONSE.transaction);
    });

    it("should extract settle response from legacy X-PAYMENT-RESPONSE header", () => {
      const encoded = btoa(JSON.stringify(SETTLE_RESPONSE));
      const response = new Response("", {
        status: 200,
        headers: { "X-PAYMENT-RESPONSE": encoded },
      });

      const result = extractSettleResponse(response);

      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(result!.transaction).toBe(SETTLE_RESPONSE.transaction);
    });

    it("should return null when no settle response headers are present", () => {
      const response = new Response("", { status: 200 });

      const result = extractSettleResponse(response);
      expect(result).toBeNull();
    });

    it("should extract tx hash from X-PAYMENT-TX-HASH header", async () => {
      const txHash = "0x" + "f".repeat(64);
      const response = new Response("{}", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT-TX-HASH": txHash,
        },
      });

      const result = await extractTxHashFromResponse(response);
      expect(result).toBe(txHash);
    });

    it("should extract tx hash from JSON body txHash field", async () => {
      const txHash = "0x" + "e".repeat(64);
      const response = new Response(JSON.stringify({ txHash }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const result = await extractTxHashFromResponse(response);
      expect(result).toBe(txHash);
    });

    it("should prefer settle response over X-PAYMENT-TX-HASH header", async () => {
      const settleHash = "0x" + "a".repeat(64);
      const headerHash = "0x" + "b".repeat(64);

      const settleEncoded = btoa(
        JSON.stringify({
          success: true,
          transaction: settleHash,
          network: "eip155:84532",
        }),
      );
      const response = new Response("{}", {
        status: 200,
        headers: {
          "PAYMENT-RESPONSE": settleEncoded,
          "X-PAYMENT-TX-HASH": headerHash,
          "Content-Type": "application/json",
        },
      });

      const result = await extractTxHashFromResponse(response);
      expect(result).toBe(settleHash);
    });

    it("should return null when no tx hash source is available", async () => {
      const response = new Response("not json", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });

      const result = await extractTxHashFromResponse(response);
      expect(result).toBeNull();
    });
  });

  // ─── 3. WalletConnect Signing Request Construction ─────────────────────────
  describe("WalletConnect Signing Request Construction", () => {
    it("should construct correct EIP-712 typed data from payment requirements", () => {
      const requirement = {
        scheme: "exact",
        network: "eip155:84532",
        asset: chainConfig.usdcAddress,
        amount: "100000", // 0.1 USDC
        payTo: ("0x" + "c".repeat(40)) as Hex,
        maxTimeoutSeconds: 3600,
        extra: { name: "USD Coin", version: "2" },
      };

      const result = createSigningRequest(
        requirement as unknown as Parameters<typeof createSigningRequest>[0],
        TEST_WALLET_ADDRESS,
      );

      // Verify domain
      expect(result.domain).toEqual(chainConfig.usdcDomain);

      // Verify primary type
      expect(result.primaryType).toBe("TransferWithAuthorization");

      // Verify types include TransferWithAuthorization
      expect(result.types).toBeDefined();
      expect(result.types.TransferWithAuthorization).toBeDefined();

      // Verify message fields
      expect(result.message.from).toBe(TEST_WALLET_ADDRESS);
      expect(result.message.to).toBe(requirement.payTo);
      expect(result.message.value).toBe(BigInt(100000));
      expect(result.message.validAfter).toBe(BigInt(0));

      // validBefore should be ~now + 300s
      const now = BigInt(Math.floor(Date.now() / 1000));
      expect(result.message.validBefore).toBeGreaterThanOrEqual(
        now + BigInt(298),
      );
      expect(result.message.validBefore).toBeLessThanOrEqual(
        now + BigInt(302),
      );

      // Nonce should be a 32-byte hex string
      expect(result.message.nonce.startsWith("0x")).toBe(true);
      expect(result.message.nonce.length).toBe(66); // 0x + 64 hex chars
    });

    it("should generate unique nonces on successive calls", () => {
      const requirement = {
        scheme: "exact",
        network: "eip155:84532",
        asset: chainConfig.usdcAddress,
        amount: "50000",
        payTo: ("0x" + "c".repeat(40)) as Hex,
        maxTimeoutSeconds: 3600,
        extra: { name: "USD Coin", version: "2" },
      };

      const req1 = createSigningRequest(
        requirement as unknown as Parameters<typeof createSigningRequest>[0],
        TEST_WALLET_ADDRESS,
      );
      const req2 = createSigningRequest(
        requirement as unknown as Parameters<typeof createSigningRequest>[0],
        TEST_WALLET_ADDRESS,
      );

      expect(req1.message.nonce).not.toBe(req2.message.nonce);
    });
  });

  // ─── 4. USDC Withdrawal Flow ──────────────────────────────────────────────
  describe("USDC Withdrawal Flow", () => {
    it("should call writeContract with correct USDC transfer params", async () => {
      const { user } = await seedTestUser();

      // Mock viem clients
      vi.doMock("viem", async (importOriginal) => {
        const actual = await importOriginal<typeof import("viem")>();
        return {
          ...actual,
          createWalletClient: () => ({
            writeContract: mockWriteContract.mockResolvedValue(
              "0x" + "d".repeat(64),
            ),
          }),
          createPublicClient: () => ({
            readContract: vi.fn().mockResolvedValue(BigInt(10_000_000)),
          }),
        };
      });

      // Balance check should return enough
      mockGetUsdcBalance.mockResolvedValue("10.000000");

      // Re-import to pick up mocked viem
      const { withdrawFromHotWallet } = await import("@/lib/hot-wallet");

      const recipientAddress =
        "0x1234567890abcdef1234567890abcdef12345678";
      const result = await withdrawFromHotWallet(
        user.id,
        1.0,
        recipientAddress,
      );

      expect(result.txHash).toBe("0x" + "d".repeat(64));

      // Verify writeContract was called with correct params
      expect(mockWriteContract).toHaveBeenCalledOnce();
      const callArgs = mockWriteContract.mock.calls[0][0];
      expect(callArgs.address).toBe(chainConfig.usdcAddress);
      expect(callArgs.functionName).toBe("transfer");
      expect(callArgs.args[0]).toBe(recipientAddress);
      expect(callArgs.args[1]).toBe(BigInt(1_000_000)); // 1.0 USDC in 6-decimal wei

      // Verify a withdrawal transaction was created in the database
      const txDocs = await Transaction.find({ userId: user._id });
      expect(txDocs).toHaveLength(1);
      expect(txDocs[0].type).toBe("withdrawal");
      expect(txDocs[0].amount).toBe(1.0);
      expect(txDocs[0].endpoint).toBe(`withdrawal:${recipientAddress}`);

      vi.doUnmock("viem");
    });

    it("should reject withdrawal with insufficient balance", async () => {
      const { user } = await seedTestUser();

      // The previous test mocked viem's createPublicClient to return 10 USDC.
      // Request more than 10 USDC to trigger the insufficient balance error.
      const { withdrawFromHotWallet } = await import("@/lib/hot-wallet");

      await expect(
        withdrawFromHotWallet(
          user.id,
          100.0, // More than the 10 USDC returned by the mocked readContract
          "0x1234567890abcdef1234567890abcdef12345678",
        ),
      ).rejects.toThrow("Insufficient balance");
    });

    it("should reject withdrawal with invalid address", async () => {
      const { withdrawFromHotWallet } = await import("@/lib/hot-wallet");

      await expect(
        withdrawFromHotWallet("000000000000000000000000", 1.0, "not-an-address"),
      ).rejects.toThrow("Invalid destination address");
    });
  });

  // ─── 5. Balance Insufficient → WalletConnect Fallback ─────────────────────
  describe("Balance Insufficient → WalletConnect Fallback", () => {
    it("should return pending_approval when hot wallet balance is below required amount", async () => {
      const { user } = await seedTestUser();

      // Hot wallet has insufficient balance
      mockGetUsdcBalance.mockResolvedValue("0.01");

      // Requirement must use chainConfig.networkString so it passes the network check
      const requirement = {
        ...V1_REQUIREMENT,
        network: chainConfig.networkString,
      };

      mockFetch.mockResolvedValueOnce(makeV1_402Response([requirement]));

      const { executePayment } = await import("@/lib/x402/payment");
      const result = await executePayment(
        "https://api.example.com/resource",
        user.id,
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe("pending_approval");
      expect(result.signingStrategy).toBe("walletconnect");
      expect(result.amount).toBe(0.05);
      expect(result.paymentRequirements).toBeDefined();
    });
  });

  // ─── 6. Network Mismatch Rejection ─────────────────────────────────────────
  describe("Network Mismatch Rejection", () => {
    it("should reject when 402 requires a different chain than configured", async () => {
      const { user } = await seedTestUser();

      // Payment requires Ethereum mainnet (eip155:1) but app is configured for Base Sepolia (eip155:84532)
      const ethereumRequirement = {
        ...V1_REQUIREMENT,
        network: "eip155:1",
      };
      mockFetch.mockResolvedValueOnce(
        makeV1_402Response([ethereumRequirement]),
      );

      const { executePayment } = await import("@/lib/x402/payment");
      const result = await executePayment(
        "https://api.example.com/resource",
        user.id,
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe("rejected");
      expect(result.error).toContain(chainConfig.networkString);
      expect(result.error).toContain("not supported");
    });

    it("should accept when 402 requires the configured chain", async () => {
      const { user } = await seedTestUser();
      const txHash = "0x" + "f".repeat(64);

      // Payment requires the configured chain (eip155:84532)
      const matchingRequirement = {
        ...V2_REQUIREMENT,
        network: chainConfig.networkString,
      };
      const paymentRequired = {
        ...V2_PAYMENT_REQUIRED,
        accepts: [matchingRequirement],
      };

      mockFetch
        .mockResolvedValueOnce(makeV2_402Response(paymentRequired))
        .mockResolvedValueOnce(
          make200Response({ "X-PAYMENT-TX-HASH": txHash }),
        );

      const { executePayment } = await import("@/lib/x402/payment");
      const result = await executePayment(
        "https://api.example.com/resource",
        user.id,
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("completed");
    });
  });

  // ─── 7. Multiple Payment Requirements ──────────────────────────────────────
  describe("Multiple Payment Requirements", () => {
    it("should handle 402 with multiple scheme entries in accepts array", async () => {
      const { user } = await seedTestUser();

      // The app checks `accepts.some(accept => accept.network === chainConfig.networkString)`
      // Use V2 format so both the network check and SDK scheme matching work
      const requirements = [
        {
          ...V2_REQUIREMENT,
          network: chainConfig.networkString, // eip155:84532 — matches
        },
        {
          scheme: "exact",
          network: "eip155:1", // Ethereum mainnet — doesn't match
          amount: "50000",
          payTo: ("0x" + "b".repeat(40)) as Hex,
          maxTimeoutSeconds: 3600,
          asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          extra: { name: "USD Coin", version: "2" },
        },
      ];

      const paymentRequired = {
        ...V2_PAYMENT_REQUIRED,
        accepts: requirements,
      };

      const txHash = "0x" + "f".repeat(64);
      mockFetch
        .mockResolvedValueOnce(makeV2_402Response(paymentRequired))
        .mockResolvedValueOnce(
          make200Response({ "X-PAYMENT-TX-HASH": txHash }),
        );

      const { executePayment } = await import("@/lib/x402/payment");
      const result = await executePayment(
        "https://api.example.com/resource",
        user.id,
      );

      // Should succeed because at least one requirement matches our chain
      expect(result.success).toBe(true);
      expect(result.status).toBe("completed");
    });

    it("should reject when no requirement matches the configured chain", async () => {
      const { user } = await seedTestUser();

      const requirements = [
        {
          ...V1_REQUIREMENT,
          network: "eip155:1",
        },
        {
          ...V1_REQUIREMENT,
          network: "eip155:137", // Polygon
        },
      ];

      mockFetch.mockResolvedValueOnce(makeV1_402Response(requirements));

      const { executePayment } = await import("@/lib/x402/payment");
      const result = await executePayment(
        "https://api.example.com/resource",
        user.id,
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe("rejected");
      expect(result.error).toContain("not supported");
    });
  });

  // ─── 8. SIWx Extension Handling ────────────────────────────────────────────
  describe("SIWx Extension Handling", () => {
    it("should attach SIGN-IN-WITH-X header when extension is present", async () => {
      const { user } = await seedTestUser();
      const txHash = "0x" + "f".repeat(64);

      // Build V2 payment requirements with SIWx extension
      // Nonce must be >=8 alphanumeric characters (SIWE spec)
      const siwxExtension = {
        info: {
          domain: "api.example.com",
          uri: "https://api.example.com/resource",
          version: "1",
          nonce: "aB3dE5fG7hJ9kL1m",
          issuedAt: new Date().toISOString(),
          statement: "Sign in to access paid resource",
        },
        supportedChains: [
          {
            chainId: "eip155:84532",
            type: "eip191" as const,
          },
        ],
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object" as const,
          properties: {
            domain: { type: "string" as const },
            address: { type: "string" as const },
          },
          required: ["domain", "address"] as const,
        },
      };

      const paymentRequiredWithSiwx = {
        ...V2_PAYMENT_REQUIRED,
        extensions: { "sign-in-with-x": siwxExtension },
      };

      mockFetch
        .mockResolvedValueOnce(makeV2_402Response(paymentRequiredWithSiwx))
        .mockResolvedValueOnce(
          make200Response({ "X-PAYMENT-TX-HASH": txHash }),
        );

      const { executePayment } = await import("@/lib/x402/payment");
      const result = await executePayment(
        "https://api.example.com/resource",
        user.id,
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("completed");

      // Verify the retry request included the SIGN-IN-WITH-X header
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const secondCallHeaders = mockFetch.mock.calls[1][1]?.headers;
      expect(secondCallHeaders).toBeDefined();
      expect(secondCallHeaders["SIGN-IN-WITH-X"]).toBeDefined();
      expect(typeof secondCallHeaders["SIGN-IN-WITH-X"]).toBe("string");
    });

    it("should reject when SIWx extension does not support the configured chain", async () => {
      const { user } = await seedTestUser();

      const siwxExtension = {
        info: {
          domain: "api.example.com",
          uri: "https://api.example.com/resource",
          version: "1",
          nonce: "aB3dE5fG7hJ9kL1m",
          issuedAt: new Date().toISOString(),
        },
        supportedChains: [
          {
            chainId: "eip155:1", // Only supports Ethereum mainnet
            type: "eip191" as const,
          },
        ],
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object" as const,
          properties: {
            domain: { type: "string" as const },
            address: { type: "string" as const },
          },
          required: ["domain", "address"] as const,
        },
      };

      const paymentRequiredWithSiwx = {
        ...V2_PAYMENT_REQUIRED,
        extensions: { "sign-in-with-x": siwxExtension },
      };

      mockFetch.mockResolvedValueOnce(
        makeV2_402Response(paymentRequiredWithSiwx),
      );

      const { executePayment } = await import("@/lib/x402/payment");
      const result = await executePayment(
        "https://api.example.com/resource",
        user.id,
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe("rejected");
      expect(result.error).toContain("SIVX failed");
      expect(result.error).toContain("not supported");
    });
  });
});
