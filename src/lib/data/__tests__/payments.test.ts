import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  getPendingPayments,
  getPendingCount,
  getPendingPayment,
  createPendingPayment,
  approvePendingPayment,
  rejectPendingPayment,
  expirePendingPayment,
} from "../payments";

type PrismaMock = typeof prisma & { _stores: Record<string, unknown[]> };

beforeEach(() => {
  const mock = prisma as PrismaMock;
  for (const store of Object.values(mock._stores)) {
    (store as unknown[]).length = 0;
  }
});

describe("getPendingPayments", () => {
  it("returns pending non-expired payments for the user", async () => {
    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: { userId: "u1", url: "https://api.example.com", amount: 1, paymentRequirements: "{}", status: "pending", expiresAt: future },
    });
    await prisma.pendingPayment.create({
      data: { userId: "u1", url: "https://api.example.com", amount: 2, paymentRequirements: "{}", status: "approved", expiresAt: future },
    });
    await prisma.pendingPayment.create({
      data: { userId: "u2", url: "https://api.example.com", amount: 3, paymentRequirements: "{}", status: "pending", expiresAt: future },
    });

    const result = await getPendingPayments("u1");
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(1);
  });

  it("excludes expired payments", async () => {
    const past = new Date(Date.now() - 60_000);
    await prisma.pendingPayment.create({
      data: { userId: "u1", url: "https://api.example.com", amount: 1, paymentRequirements: "{}", status: "pending", expiresAt: past },
    });

    const result = await getPendingPayments("u1");
    expect(result).toHaveLength(0);
  });
});

describe("getPendingCount", () => {
  it("counts pending non-expired payments", async () => {
    const future = new Date(Date.now() + 60_000);
    await prisma.pendingPayment.create({
      data: { userId: "u1", url: "https://a.com", amount: 1, paymentRequirements: "{}", status: "pending", expiresAt: future },
    });
    await prisma.pendingPayment.create({
      data: { userId: "u1", url: "https://b.com", amount: 2, paymentRequirements: "{}", status: "pending", expiresAt: future },
    });

    const count = await getPendingCount("u1");
    expect(count).toBe(2);
  });
});

describe("getPendingPayment", () => {
  it("returns a payment by ID", async () => {
    const future = new Date(Date.now() + 60_000);
    const created = await prisma.pendingPayment.create({
      data: { userId: "u1", url: "https://api.example.com", amount: 5, paymentRequirements: "{}", expiresAt: future },
    });

    const found = await getPendingPayment(created.id);
    expect(found).not.toBeNull();
    expect(found!.amount).toBe(5);
  });

  it("returns null for non-existent ID", async () => {
    const found = await getPendingPayment("nonexistent");
    expect(found).toBeNull();
  });
});

describe("createPendingPayment", () => {
  it("creates a payment with default expiry and method", async () => {
    const payment = await createPendingPayment({
      userId: "u1",
      url: "https://api.example.com",
      amount: 0.5,
      paymentRequirements: '{"test": true}',
    });

    expect(payment.userId).toBe("u1");
    expect(payment.method).toBe("GET");
    expect(payment.expiresAt).toBeInstanceOf(Date);
    expect(payment.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("uses provided method and expiry", async () => {
    const customExpiry = new Date(Date.now() + 10_000);
    const payment = await createPendingPayment({
      userId: "u1",
      url: "https://api.example.com",
      amount: 1,
      paymentRequirements: "{}",
      method: "POST",
      expiresAt: customExpiry,
    });

    expect(payment.method).toBe("POST");
    expect(payment.expiresAt.getTime()).toBe(customExpiry.getTime());
  });
});

describe("approvePendingPayment", () => {
  it("sets status to approved and stores signature", async () => {
    const future = new Date(Date.now() + 60_000);
    const created = await prisma.pendingPayment.create({
      data: { userId: "u1", url: "https://api.example.com", amount: 1, paymentRequirements: "{}", expiresAt: future },
    });

    const updated = await approvePendingPayment(created.id, "0xsig123");
    expect(updated.status).toBe("approved");
    expect(updated.signature).toBe("0xsig123");
  });
});

describe("rejectPendingPayment", () => {
  it("sets status to rejected", async () => {
    const future = new Date(Date.now() + 60_000);
    const created = await prisma.pendingPayment.create({
      data: { userId: "u1", url: "https://api.example.com", amount: 1, paymentRequirements: "{}", expiresAt: future },
    });

    const updated = await rejectPendingPayment(created.id);
    expect(updated.status).toBe("rejected");
  });
});

describe("expirePendingPayment", () => {
  it("sets status to expired", async () => {
    const future = new Date(Date.now() + 60_000);
    const created = await prisma.pendingPayment.create({
      data: { userId: "u1", url: "https://api.example.com", amount: 1, paymentRequirements: "{}", expiresAt: future },
    });

    const updated = await expirePendingPayment(created.id);
    expect(updated.status).toBe("expired");
  });
});
