/**
 * E2E tests for payment data-layer flows.
 *
 * Exercises every state transition in src/lib/data/payments.ts against mocked
 * Mongoose operations so we can verify:
 *   1. create → approve → complete  (happy path)
 *   2. create → approve → fail      (server error path)
 *   3. create → expire-with-audit   (timeout path)
 *   4. create → reject              (user dismiss path)
 *   5. expire-with-audit is race-safe (idempotent)
 *   6. create → expire → reject     (dismiss expired)
 *   7. State preconditions are enforced (no double-approve, no complete-from-pending, etc.)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { Types } from "mongoose";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({ connectDB: vi.fn(() => Promise.resolve()) }));

const mockFind = vi.fn();
const mockCountDocuments = vi.fn();
const mockFindOne = vi.fn();
const mockCreate = vi.fn();
const mockFindOneAndUpdate = vi.fn();

vi.mock("@/lib/models/pending-payment", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    PendingPayment: {
      find: mockFind,
      countDocuments: mockCountDocuments,
      findOne: mockFindOne,
      create: mockCreate,
      findOneAndUpdate: mockFindOneAndUpdate,
    },
  };
});

const mockCreateTransaction = vi.fn().mockResolvedValue({});
vi.mock("@/lib/data/transactions", () => ({
  createTransaction: (...args: unknown[]) => mockCreateTransaction(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = new Types.ObjectId();
const PAYMENT_ID = new Types.ObjectId();
const CHAIN_ID = 8453; // Base mainnet

/** Build a minimal pending-payment document with Mongoose-like shape. */
function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: PAYMENT_ID,
    userId: USER_ID,
    url: "https://api.example.com/resource",
    method: "GET",
    amount: 0,
    amountRaw: "1000000",
    asset: "USDC",
    chainId: CHAIN_ID,
    paymentRequirements: JSON.stringify({ scheme: "exact", network: "base", maxAmountRequired: "1000000" }),
    status: "pending",
    signature: null,
    requestBody: null,
    requestHeaders: null,
    responsePayload: null,
    responseStatus: null,
    txHash: null,
    completedAt: null,
    expiresAt: new Date(Date.now() + 120_000),
    createdAt: new Date(),
    ...overrides,
  };
}

function chainableLean(doc: ReturnType<typeof makeDoc> | null) {
  return { lean: () => Promise.resolve(doc) };
}

function chainableSortLean(docs: ReturnType<typeof makeDoc>[]) {
  return { sort: () => ({ lean: () => Promise.resolve(docs) }) };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Payment data-layer flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Create → Approve → Complete ─────────────────────────────────────

  describe("happy path: create → approve → complete", () => {
    it("creates a pending payment", async () => {
      const { createPendingPayment } = await import("@/lib/data/payments");

      const doc = makeDoc();
      mockCreate.mockResolvedValueOnce({ toObject: () => doc });

      const result = await createPendingPayment({
        userId: USER_ID.toString(),
        url: "https://api.example.com/resource",
        chainId: CHAIN_ID,
        paymentRequirements: doc.paymentRequirements,
        expiresAt: doc.expiresAt,
        amountRaw: "1000000",
        asset: "USDC",
      });

      expect(result.status).toBe("pending");
      expect(result.url).toBe("https://api.example.com/resource");
      expect(result.chainId).toBe(CHAIN_ID);
      expect(result.amountRaw).toBe("1000000");
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("approves a pending payment (pending → approved)", async () => {
      const { approvePendingPayment } = await import("@/lib/data/payments");

      const approvedDoc = makeDoc({ status: "approved", signature: "0xabc" });
      mockFindOneAndUpdate.mockReturnValueOnce(chainableLean(approvedDoc));

      const result = await approvePendingPayment(
        PAYMENT_ID.toString(),
        USER_ID.toString(),
        "0xabc",
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe("approved");
      expect(result!.signature).toBe("0xabc");

      // Verify the atomic precondition filter
      const filter = mockFindOneAndUpdate.mock.calls[0][0];
      expect(filter.status).toBe("pending");
      expect(filter._id).toBe(PAYMENT_ID.toString());
    });

    it("completes an approved payment (approved → completed)", async () => {
      const { completePendingPayment } = await import("@/lib/data/payments");

      const completedDoc = makeDoc({
        status: "completed",
        responsePayload: '{"data":"ok"}',
        responseStatus: 200,
        txHash: "0xtxhash",
        completedAt: new Date(),
      });
      mockFindOneAndUpdate.mockReturnValueOnce(chainableLean(completedDoc));

      const result = await completePendingPayment(
        PAYMENT_ID.toString(),
        USER_ID.toString(),
        {
          responsePayload: '{"data":"ok"}',
          responseStatus: 200,
          txHash: "0xtxhash",
        },
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe("completed");
      expect(result!.responseStatus).toBe(200);
      expect(result!.txHash).toBe("0xtxhash");

      // Verify the atomic precondition filter
      const filter = mockFindOneAndUpdate.mock.calls[0][0];
      expect(filter.status).toBe("approved");
    });
  });

  // ── 2. Create → Approve → Fail ────────────────────────────────────────

  describe("server error path: create → approve → fail", () => {
    it("fails an approved payment (approved → failed)", async () => {
      const { failPendingPayment } = await import("@/lib/data/payments");

      const failedDoc = makeDoc({
        status: "failed",
        responsePayload: "Internal Server Error",
        responseStatus: 500,
        completedAt: new Date(),
      });
      mockFindOneAndUpdate.mockReturnValueOnce(chainableLean(failedDoc));

      const result = await failPendingPayment(
        PAYMENT_ID.toString(),
        USER_ID.toString(),
        {
          responsePayload: "Internal Server Error",
          responseStatus: 500,
        },
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe("failed");
      expect(result!.responseStatus).toBe(500);

      // Verify the atomic precondition filter
      const filter = mockFindOneAndUpdate.mock.calls[0][0];
      expect(filter.status).toBe("approved");
    });
  });

  // ── 3. Create → Expire with audit ─────────────────────────────────────

  describe("timeout path: create → expirePaymentWithAudit", () => {
    it("expires a pending payment and creates an audit transaction", async () => {
      const { expirePaymentWithAudit } = await import("@/lib/data/payments");

      const expiredDoc = makeDoc({ status: "expired" });
      mockFindOneAndUpdate.mockReturnValueOnce(chainableLean(expiredDoc));

      const result = await expirePaymentWithAudit(
        PAYMENT_ID.toString(),
        USER_ID.toString(),
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe("expired");

      // Verify audit transaction was created
      expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
      const txData = mockCreateTransaction.mock.calls[0][0];
      expect(txData.status).toBe("expired");
      expect(txData.endpoint).toBe("https://api.example.com/resource");
      expect(txData.chainId).toBe(CHAIN_ID);
      expect(txData.errorMessage).toBe("Payment expired before user approval");
    });

    it("passes custom error message to audit transaction", async () => {
      const { expirePaymentWithAudit } = await import("@/lib/data/payments");

      const expiredDoc = makeDoc({ status: "expired" });
      mockFindOneAndUpdate.mockReturnValueOnce(chainableLean(expiredDoc));

      await expirePaymentWithAudit(
        PAYMENT_ID.toString(),
        USER_ID.toString(),
        "Payment expired before approval could complete",
      );

      const txData = mockCreateTransaction.mock.calls[0][0];
      expect(txData.errorMessage).toBe("Payment expired before approval could complete");
    });

    it("logs a warning when amount cannot be parsed", async () => {
      const { expirePaymentWithAudit } = await import("@/lib/data/payments");
      const { logger } = await import("@/lib/logger");

      // amountRaw is null and asset is null → formatAmountForDisplay returns "—"
      const expiredDoc = makeDoc({ status: "expired", amountRaw: null, asset: null });
      mockFindOneAndUpdate.mockReturnValueOnce(chainableLean(expiredDoc));

      const result = await expirePaymentWithAudit(
        PAYMENT_ID.toString(),
        USER_ID.toString(),
      );

      expect(result).not.toBeNull();
      // Transaction should still be created with amount 0
      expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
      const txData = mockCreateTransaction.mock.calls[0][0];
      expect(txData.amount).toBe(0);
      // Logger.warn should have been called about the unparseable amount
      expect(logger.warn).toHaveBeenCalledWith(
        "Could not determine amount for expired payment transaction",
        expect.objectContaining({
          action: "expire_amount_unknown",
          paymentId: PAYMENT_ID.toString(),
        }),
      );
    });
  });

  // ── 4. Create → Reject ────────────────────────────────────────────────

  describe("user dismiss path: create → reject", () => {
    it("rejects a pending payment (pending → rejected)", async () => {
      const { rejectPendingPayment } = await import("@/lib/data/payments");

      const rejectedDoc = makeDoc({ status: "rejected" });
      mockFindOneAndUpdate.mockReturnValueOnce(chainableLean(rejectedDoc));

      const result = await rejectPendingPayment(
        PAYMENT_ID.toString(),
        USER_ID.toString(),
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe("rejected");

      // Verify the filter allows both pending and expired
      const filter = mockFindOneAndUpdate.mock.calls[0][0];
      expect(filter.status).toEqual({ $in: ["pending", "expired"] });
    });
  });

  // ── 5. Race-safety: expirePaymentWithAudit is idempotent ──────────────

  describe("race-safety: expirePaymentWithAudit idempotency", () => {
    it("returns null and creates no transaction if already expired", async () => {
      const { expirePaymentWithAudit } = await import("@/lib/data/payments");

      // Simulate: findOneAndUpdate returns null (precondition failed — already expired)
      mockFindOneAndUpdate.mockReturnValueOnce(chainableLean(null));

      const result = await expirePaymentWithAudit(
        PAYMENT_ID.toString(),
        USER_ID.toString(),
      );

      expect(result).toBeNull();
      // No transaction should be created on a no-op
      expect(mockCreateTransaction).not.toHaveBeenCalled();
    });
  });

  // ── 6. Create → Expire → Reject (dismiss expired from dashboard) ─────

  describe("dismiss expired: create → expire → reject", () => {
    it("rejects an expired payment (expired → rejected)", async () => {
      const { rejectPendingPayment } = await import("@/lib/data/payments");

      const rejectedDoc = makeDoc({ status: "rejected" });
      mockFindOneAndUpdate.mockReturnValueOnce(chainableLean(rejectedDoc));

      const result = await rejectPendingPayment(
        PAYMENT_ID.toString(),
        USER_ID.toString(),
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe("rejected");
    });
  });

  // ── 7. State preconditions are enforced ────────────────────────────────

  describe("state preconditions", () => {
    it("cannot approve an already-approved payment (returns null)", async () => {
      const { approvePendingPayment } = await import("@/lib/data/payments");

      // findOneAndUpdate returns null because status != "pending"
      mockFindOneAndUpdate.mockReturnValueOnce(chainableLean(null));

      const result = await approvePendingPayment(
        PAYMENT_ID.toString(),
        USER_ID.toString(),
        "0xabc",
      );

      expect(result).toBeNull();
    });

    it("cannot complete a pending payment (must be approved first)", async () => {
      const { completePendingPayment } = await import("@/lib/data/payments");

      mockFindOneAndUpdate.mockReturnValueOnce(chainableLean(null));

      const result = await completePendingPayment(
        PAYMENT_ID.toString(),
        USER_ID.toString(),
        { responsePayload: "ok", responseStatus: 200 },
      );

      expect(result).toBeNull();
    });

    it("cannot fail a pending payment (must be approved first)", async () => {
      const { failPendingPayment } = await import("@/lib/data/payments");

      mockFindOneAndUpdate.mockReturnValueOnce(chainableLean(null));

      const result = await failPendingPayment(
        PAYMENT_ID.toString(),
        USER_ID.toString(),
        { error: "something went wrong" },
      );

      expect(result).toBeNull();
    });

    it("cannot expire an already-completed payment (expirePaymentWithAudit returns null)", async () => {
      const { expirePaymentWithAudit } = await import("@/lib/data/payments");

      // Simulate: findOneAndUpdate returns null (precondition failed — not pending)
      mockFindOneAndUpdate.mockReturnValueOnce(chainableLean(null));

      const result = await expirePaymentWithAudit(
        PAYMENT_ID.toString(),
        USER_ID.toString(),
      );

      expect(result).toBeNull();
      // No transaction should be created when the underlying expire is a no-op
      expect(mockCreateTransaction).not.toHaveBeenCalled();
    });

    it("cannot reject a completed payment", async () => {
      const { rejectPendingPayment } = await import("@/lib/data/payments");

      mockFindOneAndUpdate.mockReturnValueOnce(chainableLean(null));

      const result = await rejectPendingPayment(
        PAYMENT_ID.toString(),
        USER_ID.toString(),
      );

      expect(result).toBeNull();
    });
  });

  // ── 8. User scoping ───────────────────────────────────────────────────

  describe("user scoping: all queries filter by userId", () => {
    it("getPendingPayments scopes by userId", async () => {
      const { getPendingPayments } = await import("@/lib/data/payments");

      mockFind.mockReturnValueOnce(chainableSortLean([]));

      await getPendingPayments(USER_ID.toString());

      const filter = (mockFind as Mock).mock.calls[0][0];
      expect(filter.userId).toBeInstanceOf(Types.ObjectId);
      expect(filter.userId.toString()).toBe(USER_ID.toString());
    });

    it("getPendingPayment scopes by userId", async () => {
      const { getPendingPayment } = await import("@/lib/data/payments");

      mockFindOne.mockReturnValueOnce(chainableLean(null));

      await getPendingPayment(PAYMENT_ID.toString(), USER_ID.toString());

      const filter = (mockFindOne as Mock).mock.calls[0][0];
      expect(filter.userId).toBeInstanceOf(Types.ObjectId);
      expect(filter.userId.toString()).toBe(USER_ID.toString());
      expect(filter._id).toBe(PAYMENT_ID.toString());
    });

    it("getPendingCount scopes by userId", async () => {
      const { getPendingCount } = await import("@/lib/data/payments");

      mockCountDocuments.mockResolvedValueOnce(0);

      await getPendingCount(USER_ID.toString());

      const filter = (mockCountDocuments as Mock).mock.calls[0][0];
      expect(filter.userId).toBeInstanceOf(Types.ObjectId);
      expect(filter.userId.toString()).toBe(USER_ID.toString());
    });

    it("approvePendingPayment scopes by userId", async () => {
      const { approvePendingPayment } = await import("@/lib/data/payments");

      mockFindOneAndUpdate.mockReturnValueOnce(chainableLean(null));

      await approvePendingPayment(PAYMENT_ID.toString(), USER_ID.toString(), "0xabc");

      const filter = (mockFindOneAndUpdate as Mock).mock.calls[0][0];
      expect(filter.userId).toBeInstanceOf(Types.ObjectId);
      expect(filter.userId.toString()).toBe(USER_ID.toString());
    });
  });

  // ── 9. Query filters ──────────────────────────────────────────────────

  describe("query filters", () => {
    it("getPendingPayments filters by chainId when provided", async () => {
      const { getPendingPayments } = await import("@/lib/data/payments");

      mockFind.mockReturnValueOnce(chainableSortLean([]));

      await getPendingPayments(USER_ID.toString(), { chainId: 137 });

      const filter = (mockFind as Mock).mock.calls[0][0];
      expect(filter.chainId).toBe(137);
    });

    it("getPendingPayments includes expired when requested", async () => {
      const { getPendingPayments } = await import("@/lib/data/payments");

      mockFind.mockReturnValueOnce(chainableSortLean([]));

      await getPendingPayments(USER_ID.toString(), { includeExpired: true });

      const filter = (mockFind as Mock).mock.calls[0][0];
      expect(filter.status).toEqual({ $in: ["pending", "expired"] });
      // Should NOT have expiresAt filter when includeExpired is true
      expect(filter.expiresAt).toBeUndefined();
    });

    it("getPendingPayments filters by expiresAt when not including expired", async () => {
      const { getPendingPayments } = await import("@/lib/data/payments");

      mockFind.mockReturnValueOnce(chainableSortLean([]));

      await getPendingPayments(USER_ID.toString());

      const filter = (mockFind as Mock).mock.calls[0][0];
      expect(filter.status).toBe("pending");
      expect(filter.expiresAt).toBeDefined();
      expect(filter.expiresAt.$gt).toBeInstanceOf(Date);
    });
  });
});
