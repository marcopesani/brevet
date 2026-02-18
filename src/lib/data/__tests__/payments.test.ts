import { describe, it, expect } from "vitest";
import { PendingPayment } from "@/lib/models/pending-payment";
import { Types } from "mongoose";
import {
  getPendingPayments,
  getPendingCount,
  getPendingPayment,
  getPendingPaymentById,
  createPendingPayment,
  completePendingPayment,
  failPendingPayment,
  approvePendingPayment,
  rejectPendingPayment,
  expirePendingPayment,
} from "../payments";

const uid = () => new Types.ObjectId().toString();

describe("getPendingPayments", () => {
  it("returns pending non-expired payments for the user", async () => {
    const userId = uid();
    const future = new Date(Date.now() + 60_000);
    await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://api.example.com", amount: 1, paymentRequirements: "{}", status: "pending", expiresAt: future });
    await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://api.example.com", amount: 2, paymentRequirements: "{}", status: "approved", expiresAt: future });
    const otherUser = uid();
    await PendingPayment.create({ userId: new Types.ObjectId(otherUser), url: "https://api.example.com", amount: 3, paymentRequirements: "{}", status: "pending", expiresAt: future });

    const result = await getPendingPayments(userId);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(1);
  });

  it("excludes expired payments", async () => {
    const userId = uid();
    const past = new Date(Date.now() - 60_000);
    await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://api.example.com", amount: 1, paymentRequirements: "{}", status: "pending", expiresAt: past });

    const result = await getPendingPayments(userId);
    expect(result).toHaveLength(0);
  });
});

describe("getPendingCount", () => {
  it("counts pending non-expired payments", async () => {
    const userId = uid();
    const future = new Date(Date.now() + 60_000);
    await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://a.com", amount: 1, paymentRequirements: "{}", status: "pending", expiresAt: future });
    await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://b.com", amount: 2, paymentRequirements: "{}", status: "pending", expiresAt: future });

    const count = await getPendingCount(userId);
    expect(count).toBe(2);
  });
});

describe("getPendingPayment", () => {
  it("returns a payment by ID", async () => {
    const userId = uid();
    const future = new Date(Date.now() + 60_000);
    const created = await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://api.example.com", amount: 5, paymentRequirements: "{}", expiresAt: future });

    const found = await getPendingPayment(created._id.toString());
    expect(found).not.toBeNull();
    expect(found!.amount).toBe(5);
  });

  it("returns null for non-existent ID", async () => {
    const found = await getPendingPayment(new Types.ObjectId().toString());
    expect(found).toBeNull();
  });
});

describe("createPendingPayment", () => {
  it("creates a payment with default expiry and method", async () => {
    const userId = uid();
    const payment = await createPendingPayment({
      userId,
      url: "https://api.example.com",
      amount: 0.5,
      paymentRequirements: '{"test": true}',
    });

    expect(payment.id).toBeDefined();
    expect(payment.method).toBe("GET");
    expect(payment.expiresAt).toBeInstanceOf(Date);
    expect(payment.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("uses provided method and expiry", async () => {
    const userId = uid();
    const customExpiry = new Date(Date.now() + 10_000);
    const payment = await createPendingPayment({
      userId,
      url: "https://api.example.com",
      amount: 1,
      paymentRequirements: "{}",
      method: "POST",
      expiresAt: customExpiry,
    });

    expect(payment.method).toBe("POST");
    expect(payment.expiresAt.getTime()).toBe(customExpiry.getTime());
  });

  it("stores optional body and headers", async () => {
    const userId = uid();
    const payment = await createPendingPayment({
      userId,
      url: "https://api.example.com",
      amount: 1,
      paymentRequirements: "{}",
      body: '{"query": "test"}',
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token" },
    });

    expect(payment.requestBody).toBe('{"query": "test"}');
    expect(payment.requestHeaders).toBe(JSON.stringify({ "Content-Type": "application/json", "Authorization": "Bearer token" }));
  });

  it("sets requestBody and requestHeaders to null when not provided", async () => {
    const userId = uid();
    const payment = await createPendingPayment({
      userId,
      url: "https://api.example.com",
      amount: 1,
      paymentRequirements: "{}",
    });

    expect(payment.requestBody).toBeNull();
    expect(payment.requestHeaders).toBeNull();
  });
});

describe("getPendingPaymentById", () => {
  it("returns a payment by ID", async () => {
    const userId = uid();
    const future = new Date(Date.now() + 60_000);
    const created = await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://api.example.com", amount: 5, paymentRequirements: "{}", expiresAt: future });

    const found = await getPendingPaymentById(created._id.toString());
    expect(found).not.toBeNull();
    expect(found!.amount).toBe(5);
  });

  it("returns null for non-existent ID", async () => {
    const found = await getPendingPaymentById(new Types.ObjectId().toString());
    expect(found).toBeNull();
  });
});

describe("completePendingPayment", () => {
  it("sets status to completed and stores response data", async () => {
    const userId = uid();
    const future = new Date(Date.now() + 60_000);
    const created = await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://api.example.com", amount: 1, paymentRequirements: "{}", status: "approved", expiresAt: future });

    const updated = await completePendingPayment(created._id.toString(), {
      responsePayload: '{"result": "success"}',
      responseStatus: 200,
      txHash: "0xabc123",
    });

    expect(updated!.status).toBe("completed");
    expect(updated!.responsePayload).toBe('{"result": "success"}');
    expect(updated!.responseStatus).toBe(200);
    expect(updated!.txHash).toBe("0xabc123");
    expect(updated!.completedAt).toBeInstanceOf(Date);
  });

  it("stores null txHash when not provided", async () => {
    const userId = uid();
    const future = new Date(Date.now() + 60_000);
    const created = await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://api.example.com", amount: 1, paymentRequirements: "{}", status: "approved", expiresAt: future });

    const updated = await completePendingPayment(created._id.toString(), {
      responsePayload: "OK",
      responseStatus: 200,
    });

    expect(updated!.status).toBe("completed");
    expect(updated!.txHash).toBeNull();
    expect(updated!.completedAt).toBeInstanceOf(Date);
  });
});

describe("failPendingPayment", () => {
  it("sets status to failed and stores error details", async () => {
    const userId = uid();
    const future = new Date(Date.now() + 60_000);
    const created = await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://api.example.com", amount: 1, paymentRequirements: "{}", status: "approved", expiresAt: future });

    const updated = await failPendingPayment(created._id.toString(), {
      responsePayload: "Internal Server Error",
      responseStatus: 500,
    });

    expect(updated!.status).toBe("failed");
    expect(updated!.responsePayload).toBe("Internal Server Error");
    expect(updated!.responseStatus).toBe(500);
    expect(updated!.completedAt).toBeInstanceOf(Date);
  });

  it("stores error string when no response data", async () => {
    const userId = uid();
    const future = new Date(Date.now() + 60_000);
    const created = await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://api.example.com", amount: 1, paymentRequirements: "{}", status: "approved", expiresAt: future });

    const updated = await failPendingPayment(created._id.toString(), {
      error: "Network timeout",
    });

    expect(updated!.status).toBe("failed");
    expect(updated!.responsePayload).toBe("Network timeout");
    expect(updated!.responseStatus).toBeNull();
    expect(updated!.completedAt).toBeInstanceOf(Date);
  });

  it("stores null when no error details provided", async () => {
    const userId = uid();
    const future = new Date(Date.now() + 60_000);
    const created = await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://api.example.com", amount: 1, paymentRequirements: "{}", status: "approved", expiresAt: future });

    const updated = await failPendingPayment(created._id.toString(), {});

    expect(updated!.status).toBe("failed");
    expect(updated!.responsePayload).toBeNull();
    expect(updated!.responseStatus).toBeNull();
  });
});

describe("approvePendingPayment", () => {
  it("sets status to approved and stores signature", async () => {
    const userId = uid();
    const future = new Date(Date.now() + 60_000);
    const created = await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://api.example.com", amount: 1, paymentRequirements: "{}", expiresAt: future });

    const updated = await approvePendingPayment(created._id.toString(), "0xsig123");
    expect(updated!.status).toBe("approved");
    expect(updated!.signature).toBe("0xsig123");
  });
});

describe("rejectPendingPayment", () => {
  it("sets status to rejected", async () => {
    const userId = uid();
    const future = new Date(Date.now() + 60_000);
    const created = await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://api.example.com", amount: 1, paymentRequirements: "{}", expiresAt: future });

    const updated = await rejectPendingPayment(created._id.toString());
    expect(updated!.status).toBe("rejected");
  });
});

describe("expirePendingPayment", () => {
  it("sets status to expired", async () => {
    const userId = uid();
    const future = new Date(Date.now() + 60_000);
    const created = await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://api.example.com", amount: 1, paymentRequirements: "{}", expiresAt: future });

    const updated = await expirePendingPayment(created._id.toString());
    expect(updated!.status).toBe("expired");
  });
});

describe("chainId filtering", () => {
  it("getPendingPayments filters by chainId", async () => {
    const userId = uid();
    const future = new Date(Date.now() + 60_000);
    await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://a.com", amount: 1, paymentRequirements: "{}", status: "pending", expiresAt: future, chainId: 8453 });
    await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://b.com", amount: 2, paymentRequirements: "{}", status: "pending", expiresAt: future, chainId: 42161 });

    const baseOnly = await getPendingPayments(userId, { chainId: 8453 });
    expect(baseOnly).toHaveLength(1);
    expect(baseOnly[0].amount).toBe(1);

    const arbOnly = await getPendingPayments(userId, { chainId: 42161 });
    expect(arbOnly).toHaveLength(1);
    expect(arbOnly[0].amount).toBe(2);

    const all = await getPendingPayments(userId);
    expect(all).toHaveLength(2);
  });

  it("getPendingCount filters by chainId", async () => {
    const userId = uid();
    const future = new Date(Date.now() + 60_000);
    await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://a.com", amount: 1, paymentRequirements: "{}", status: "pending", expiresAt: future, chainId: 8453 });
    await PendingPayment.create({ userId: new Types.ObjectId(userId), url: "https://b.com", amount: 2, paymentRequirements: "{}", status: "pending", expiresAt: future, chainId: 42161 });

    const baseCount = await getPendingCount(userId, { chainId: 8453 });
    expect(baseCount).toBe(1);

    const allCount = await getPendingCount(userId);
    expect(allCount).toBe(2);
  });

  it("createPendingPayment stores chainId when provided", async () => {
    const userId = uid();
    const payment = await createPendingPayment({
      userId,
      url: "https://api.example.com",
      amount: 0.5,
      chainId: 42161,
      paymentRequirements: "{}",
    });

    expect(payment.chainId).toBe(42161);
  });

  it("createPendingPayment defaults chainId from env when not provided", async () => {
    const userId = uid();
    const payment = await createPendingPayment({
      userId,
      url: "https://api.example.com",
      amount: 0.5,
      paymentRequirements: "{}",
    });

    expect(payment.chainId).toBeDefined();
    expect(typeof payment.chainId).toBe("number");
  });
});
