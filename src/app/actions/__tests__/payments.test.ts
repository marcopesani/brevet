import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock auth
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(),
}));

// Mock x402 headers
vi.mock("@/lib/x402/headers", () => ({
  buildPaymentHeaders: vi.fn().mockReturnValue({
    "X-PAYMENT": "mock-payment-header",
  }),
  extractSettleResponse: vi.fn().mockReturnValue(null),
  extractTxHashFromResponse: vi.fn().mockResolvedValue(null),
}));

type PrismaMock = typeof prisma & { _stores: Record<string, unknown[]> };

const TEST_USER_ID = "00000000-0000-4000-a000-000000000001";

const MOCK_AUTHORIZATION = {
  from: "0x1234567890abcdef1234567890abcdef12345678",
  to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  value: "50000",
  validAfter: "0",
  validBefore: "999999999999",
  nonce: "0x0000000000000000000000000000000000000000000000000000000000000001",
};

const MOCK_PAYMENT_REQUIREMENTS = JSON.stringify([
  {
    scheme: "exact",
    network: "eip155:84532",
    maxAmountRequired: "50000",
    resource: "https://api.example.com/paid-resource",
    payTo: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    requiredDeadlineSeconds: 3600,
  },
]);

describe("approvePendingPayment server action", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const mock = prisma as PrismaMock;
    for (const store of Object.values(mock._stores)) {
      (store as unknown[]).length = 0;
    }
  });

  it("successfully approves payment and stores response on success", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    const { extractTxHashFromResponse } = await import("@/lib/x402/headers");
    vi.mocked(extractTxHashFromResponse).mockResolvedValue("0xtxhash123");

    // Mock the paid fetch to return a successful response
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response('{"result": "paid data"}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/paid-resource",
        method: "POST",
        amount: 0.05,
        paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
        status: "pending",
        expiresAt: future,
        requestBody: '{"query": "test"}',
        requestHeaders: JSON.stringify({ "Content-Type": "application/json" }),
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});

    const { approvePendingPayment } = await import("../payments");
    const result = await approvePendingPayment(
      payment!.id,
      "0xmocksignature",
      MOCK_AUTHORIZATION,
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);

    // Verify fetch was called with stored request context
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/paid-resource",
      expect.objectContaining({
        method: "POST",
        body: '{"query": "test"}',
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-PAYMENT": "mock-payment-header",
        }),
      }),
    );

    // Verify the pending payment was completed
    const updated = await prisma.pendingPayment.findUnique({
      where: { id: payment!.id },
    });
    expect(updated!.status).toBe("completed");
    expect(updated!.responsePayload).toBe('{"result": "paid data"}');
    expect(updated!.responseStatus).toBe(200);
    expect(updated!.txHash).toBe("0xtxhash123");
    expect(updated!.completedAt).toBeInstanceOf(Date);

    // Verify a transaction was created with responseStatus and no errorMessage
    const transactions = await prisma.transaction.findMany({});
    expect(transactions).toHaveLength(1);
    expect(transactions[0].status).toBe("completed");
    expect(transactions[0].txHash).toBe("0xtxhash123");
    expect(transactions[0].responseStatus).toBe(200);
    expect(transactions[0].errorMessage).toBeUndefined();
  });

  it("stores failed response when paid fetch returns non-2xx", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Bad Gateway", {
        status: 502,
      }),
    );

    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/paid-resource",
        amount: 0.05,
        paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
        status: "pending",
        expiresAt: future,
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});

    const { approvePendingPayment } = await import("../payments");
    const result = await approvePendingPayment(
      payment!.id,
      "0xmocksignature",
      MOCK_AUTHORIZATION,
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(502);

    // Verify the pending payment was marked as failed
    const updated = await prisma.pendingPayment.findUnique({
      where: { id: payment!.id },
    });
    expect(updated!.status).toBe("failed");
    expect(updated!.responsePayload).toBe("Bad Gateway");
    expect(updated!.responseStatus).toBe(502);

    // Verify a failed transaction was created with errorMessage and responseStatus
    const transactions = await prisma.transaction.findMany({});
    expect(transactions).toHaveLength(1);
    expect(transactions[0].status).toBe("failed");
    expect(transactions[0].errorMessage).toContain("server responded with 502");
    expect(transactions[0].responseStatus).toBe(502);
  });

  it("uses stored requestHeaders in the paid fetch", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("OK", { status: 200 }),
    );

    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/paid-resource",
        amount: 0.05,
        paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
        status: "pending",
        expiresAt: future,
        requestHeaders: JSON.stringify({
          Authorization: "Bearer mytoken",
          "X-Custom": "custom-value",
        }),
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});

    const { approvePendingPayment } = await import("../payments");
    await approvePendingPayment(
      payment!.id,
      "0xmocksignature",
      MOCK_AUTHORIZATION,
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer mytoken",
          "X-Custom": "custom-value",
        }),
      }),
    );
  });

  it("handles payment with no stored body or headers", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("OK", { status: 200 }),
    );

    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/paid-resource",
        method: "GET",
        amount: 0.05,
        paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
        status: "pending",
        expiresAt: future,
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});

    const { approvePendingPayment } = await import("../payments");
    const result = await approvePendingPayment(
      payment!.id,
      "0xmocksignature",
      MOCK_AUTHORIZATION,
    );

    expect(result.success).toBe(true);

    // Should not include body for GET requests with no stored body
    const callArgs = fetchSpy.mock.calls[0][1]!;
    expect(callArgs.body).toBeUndefined();
  });

  it("throws error for unauthenticated user", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const { approvePendingPayment } = await import("../payments");
    await expect(
      approvePendingPayment("some-id", "0xsig", MOCK_AUTHORIZATION),
    ).rejects.toThrow("Unauthorized");
  });

  it("throws error for non-existent payment", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    const { approvePendingPayment } = await import("../payments");
    await expect(
      approvePendingPayment("nonexistent", "0xsig", MOCK_AUTHORIZATION),
    ).rejects.toThrow("Pending payment not found");
  });

  it("throws error when payment belongs to different user", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: "different-user-id",
        url: "https://api.example.com/paid-resource",
        amount: 0.05,
        paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
        status: "pending",
        expiresAt: future,
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});

    const { approvePendingPayment } = await import("../payments");
    await expect(
      approvePendingPayment(payment!.id, "0xsig", MOCK_AUTHORIZATION),
    ).rejects.toThrow("Forbidden");
  });

  it("throws error for already approved payment", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/paid-resource",
        amount: 0.05,
        paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
        status: "approved",
        expiresAt: future,
        signature: "0xoldsig",
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});

    const { approvePendingPayment } = await import("../payments");
    await expect(
      approvePendingPayment(payment!.id, "0xsig", MOCK_AUTHORIZATION),
    ).rejects.toThrow("Payment is already approved");
  });

  it("throws error and expires payment that has timed out", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    const past = new Date(Date.now() - 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/paid-resource",
        amount: 0.05,
        paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
        status: "pending",
        expiresAt: past,
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});

    const { approvePendingPayment } = await import("../payments");
    await expect(
      approvePendingPayment(payment!.id, "0xsig", MOCK_AUTHORIZATION),
    ).rejects.toThrow("Payment has expired");

    // Verify the payment was marked as expired
    const updated = await prisma.pendingPayment.findUnique({
      where: { id: payment!.id },
    });
    expect(updated!.status).toBe("expired");
  });

  it("handles network error: creates failed transaction and marks payment as failed", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    // Mock fetch to throw a network error
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("fetch failed: DNS resolution failed"),
    );

    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: {
        userId: TEST_USER_ID,
        url: "https://api.example.com/paid-resource",
        amount: 0.05,
        paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
        status: "pending",
        expiresAt: future,
      },
    });

    const payment = await prisma.pendingPayment.findFirst({});

    const { approvePendingPayment } = await import("../payments");
    const result = await approvePendingPayment(
      payment!.id,
      "0xmocksignature",
      MOCK_AUTHORIZATION,
    );

    // Should return a failure result (not throw)
    expect(result.success).toBe(false);
    expect(result.status).toBe(0);

    // Verify a failed transaction was created with Network error message
    const transactions = await prisma.transaction.findMany({});
    expect(transactions).toHaveLength(1);
    expect(transactions[0].status).toBe("failed");
    expect(transactions[0].errorMessage).toMatch(/^Network error:/);
    expect(transactions[0].errorMessage).toContain("DNS resolution failed");

    // Verify the pending payment was marked as failed
    const updated = await prisma.pendingPayment.findUnique({
      where: { id: payment!.id },
    });
    expect(updated!.status).toBe("failed");
  });
});
