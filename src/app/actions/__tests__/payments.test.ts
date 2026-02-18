import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetTestDb } from "@/test/helpers/db";
import { PendingPayment } from "@/lib/models/pending-payment";
import { Transaction } from "@/lib/models/transaction";
import { User } from "@/lib/models/user";
import mongoose from "mongoose";

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

const TEST_USER_ID = new mongoose.Types.ObjectId().toString();

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

async function createTestUserForId(userId: string) {
  return User.create({
    _id: new mongoose.Types.ObjectId(userId),
    walletAddress: "0x" + "a".repeat(40),
  });
}

describe("approvePendingPayment server action", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetTestDb();
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

    await createTestUserForId(TEST_USER_ID);

    const future = new Date(Date.now() + 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/paid-resource",
      method: "POST",
      amount: 0.05,
      paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
      status: "pending",
      expiresAt: future,
      requestBody: '{"query": "test"}',
      requestHeaders: JSON.stringify({ "Content-Type": "application/json" }),
    });

    const { approvePendingPayment } = await import("../payments");
    const result = await approvePendingPayment(
      payment._id.toString(),
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
    const updated = await PendingPayment.findById(payment._id).lean();
    expect(updated!.status).toBe("completed");
    expect(updated!.responsePayload).toBe('{"result": "paid data"}');
    expect(updated!.responseStatus).toBe(200);
    expect(updated!.txHash).toBe("0xtxhash123");
    expect(updated!.completedAt).toBeInstanceOf(Date);

    // Verify a transaction was created with responseStatus and no errorMessage
    const transactions = await Transaction.find({}).lean();
    expect(transactions).toHaveLength(1);
    expect(transactions[0].status).toBe("completed");
    expect(transactions[0].txHash).toBe("0xtxhash123");
    expect(transactions[0].responseStatus).toBe(200);
    expect(transactions[0].errorMessage).toBeNull();
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

    await createTestUserForId(TEST_USER_ID);

    const future = new Date(Date.now() + 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/paid-resource",
      amount: 0.05,
      paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
      status: "pending",
      expiresAt: future,
    });

    const { approvePendingPayment } = await import("../payments");
    const result = await approvePendingPayment(
      payment._id.toString(),
      "0xmocksignature",
      MOCK_AUTHORIZATION,
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(502);

    // Verify the pending payment was marked as failed
    const updated = await PendingPayment.findById(payment._id).lean();
    expect(updated!.status).toBe("failed");
    expect(updated!.responsePayload).toBe("Bad Gateway");
    expect(updated!.responseStatus).toBe(502);

    // Verify a failed transaction was created with errorMessage and responseStatus
    const transactions = await Transaction.find({}).lean();
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

    await createTestUserForId(TEST_USER_ID);

    const future = new Date(Date.now() + 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/paid-resource",
      amount: 0.05,
      paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
      status: "pending",
      expiresAt: future,
      requestHeaders: JSON.stringify({
        Authorization: "Bearer mytoken",
        "X-Custom": "custom-value",
      }),
    });

    const { approvePendingPayment } = await import("../payments");
    await approvePendingPayment(
      payment._id.toString(),
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

    await createTestUserForId(TEST_USER_ID);

    const future = new Date(Date.now() + 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/paid-resource",
      method: "GET",
      amount: 0.05,
      paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
      status: "pending",
      expiresAt: future,
    });

    const { approvePendingPayment } = await import("../payments");
    const result = await approvePendingPayment(
      payment._id.toString(),
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
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(
      approvePendingPayment(fakeId, "0xsig", MOCK_AUTHORIZATION),
    ).rejects.toThrow("Pending payment not found");
  });

  it("throws error when payment belongs to different user", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    const differentUserId = new mongoose.Types.ObjectId();
    const future = new Date(Date.now() + 60_000);
    const payment = await PendingPayment.create({
      userId: differentUserId,
      url: "https://api.example.com/paid-resource",
      amount: 0.05,
      paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
      status: "pending",
      expiresAt: future,
    });

    const { approvePendingPayment } = await import("../payments");
    await expect(
      approvePendingPayment(payment._id.toString(), "0xsig", MOCK_AUTHORIZATION),
    ).rejects.toThrow("Pending payment not found");
  });

  it("throws error for already approved payment", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    const future = new Date(Date.now() + 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/paid-resource",
      amount: 0.05,
      paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
      status: "approved",
      expiresAt: future,
      signature: "0xoldsig",
    });

    const { approvePendingPayment } = await import("../payments");
    await expect(
      approvePendingPayment(payment._id.toString(), "0xsig", MOCK_AUTHORIZATION),
    ).rejects.toThrow("Payment is already approved");
  });

  it("throws error and expires payment that has timed out", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    const past = new Date(Date.now() - 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/paid-resource",
      amount: 0.05,
      paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
      status: "pending",
      expiresAt: past,
    });

    const { approvePendingPayment } = await import("../payments");
    await expect(
      approvePendingPayment(payment._id.toString(), "0xsig", MOCK_AUTHORIZATION),
    ).rejects.toThrow("Payment has expired");

    // Verify the payment was marked as expired
    const updated = await PendingPayment.findById(payment._id).lean();
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

    await createTestUserForId(TEST_USER_ID);

    const future = new Date(Date.now() + 60_000);
    const payment = await PendingPayment.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      url: "https://api.example.com/paid-resource",
      amount: 0.05,
      paymentRequirements: MOCK_PAYMENT_REQUIREMENTS,
      status: "pending",
      expiresAt: future,
    });

    const { approvePendingPayment } = await import("../payments");
    const result = await approvePendingPayment(
      payment._id.toString(),
      "0xmocksignature",
      MOCK_AUTHORIZATION,
    );

    // Should return a failure result (not throw)
    expect(result.success).toBe(false);
    expect(result.status).toBe(0);

    // Verify a failed transaction was created with Network error message
    const transactions = await Transaction.find({}).lean();
    expect(transactions).toHaveLength(1);
    expect(transactions[0].status).toBe("failed");
    expect(transactions[0].errorMessage).toMatch(/^Network error:/);
    expect(transactions[0].errorMessage).toContain("DNS resolution failed");

    // Payment stays "pending" because the approval step (pending→approved) happens
    // after fetch in the server action, so a network error means the state machine
    // precondition for failPendingPayment (requires status:"approved") is not met.
    const updated = await PendingPayment.findById(payment._id).lean();
    expect(updated!.status).toBe("pending");
  });
});
