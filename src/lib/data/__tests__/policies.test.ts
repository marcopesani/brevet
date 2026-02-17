import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  getPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  activatePolicy,
  toggleHotWallet,
  archivePolicy,
} from "../policies";

type PrismaMock = typeof prisma & { _stores: Record<string, unknown[]> };

beforeEach(() => {
  const mock = prisma as PrismaMock;
  for (const store of Object.values(mock._stores)) {
    (store as unknown[]).length = 0;
  }
});

describe("getPolicies", () => {
  it("returns all policies for a user", async () => {
    await prisma.endpointPolicy.create({
      data: { userId: "u1", endpointPattern: "https://a.com", status: "active" },
    });
    await prisma.endpointPolicy.create({
      data: { userId: "u1", endpointPattern: "https://b.com", status: "draft" },
    });
    await prisma.endpointPolicy.create({
      data: { userId: "u2", endpointPattern: "https://c.com", status: "active" },
    });

    const result = await getPolicies("u1");
    expect(result).toHaveLength(2);
  });

  it("filters by status when provided", async () => {
    await prisma.endpointPolicy.create({
      data: { userId: "u1", endpointPattern: "https://a.com", status: "active" },
    });
    await prisma.endpointPolicy.create({
      data: { userId: "u1", endpointPattern: "https://b.com", status: "draft" },
    });

    const result = await getPolicies("u1", "active");
    expect(result).toHaveLength(1);
    expect(result[0].endpointPattern).toBe("https://a.com");
  });
});

describe("getPolicy", () => {
  it("returns a policy by ID", async () => {
    const created = await prisma.endpointPolicy.create({
      data: { userId: "u1", endpointPattern: "https://a.com" },
    });

    const found = await getPolicy(created.id);
    expect(found).not.toBeNull();
    expect(found!.endpointPattern).toBe("https://a.com");
  });

  it("returns null for non-existent ID", async () => {
    const found = await getPolicy("nonexistent");
    expect(found).toBeNull();
  });
});

describe("createPolicy", () => {
  it("creates a policy", async () => {
    const policy = await createPolicy("u1", {
      endpointPattern: "https://api.example.com",
      status: "active",
    });

    expect(policy).not.toBeNull();
    expect(policy!.userId).toBe("u1");
    expect(policy!.endpointPattern).toBe("https://api.example.com");
  });

  it("returns null if duplicate endpointPattern for same user", async () => {
    await prisma.endpointPolicy.create({
      data: { userId: "u1", endpointPattern: "https://api.example.com" },
    });

    const result = await createPolicy("u1", { endpointPattern: "https://api.example.com" });
    expect(result).toBeNull();
  });
});

describe("updatePolicy", () => {
  it("updates policy fields", async () => {
    const created = await prisma.endpointPolicy.create({
      data: { userId: "u1", endpointPattern: "https://a.com", payFromHotWallet: false },
    });

    const updated = await updatePolicy(created.id, "u1", { payFromHotWallet: true });
    expect(updated).not.toBeNull();
    expect(updated!.payFromHotWallet).toBe(true);
  });

  it("returns null if endpointPattern conflicts", async () => {
    const p1 = await prisma.endpointPolicy.create({
      data: { userId: "u1", endpointPattern: "https://a.com" },
    });
    await prisma.endpointPolicy.create({
      data: { userId: "u1", endpointPattern: "https://b.com" },
    });

    const result = await updatePolicy(p1.id, "u1", { endpointPattern: "https://b.com" });
    expect(result).toBeNull();
  });
});

describe("activatePolicy", () => {
  it("sets status to active", async () => {
    const created = await prisma.endpointPolicy.create({
      data: { userId: "u1", endpointPattern: "https://a.com", status: "draft" },
    });

    const updated = await activatePolicy(created.id);
    expect(updated.status).toBe("active");
  });
});

describe("toggleHotWallet", () => {
  it("toggles payFromHotWallet", async () => {
    const created = await prisma.endpointPolicy.create({
      data: { userId: "u1", endpointPattern: "https://a.com", payFromHotWallet: false },
    });

    const updated = await toggleHotWallet(created.id, true);
    expect(updated.payFromHotWallet).toBe(true);
  });
});

describe("archivePolicy", () => {
  it("sets status to archived and archivedAt timestamp", async () => {
    const created = await prisma.endpointPolicy.create({
      data: { userId: "u1", endpointPattern: "https://a.com", status: "active" },
    });

    const updated = await archivePolicy(created.id);
    expect(updated.status).toBe("archived");
    expect(updated.archivedAt).toBeInstanceOf(Date);
  });
});
