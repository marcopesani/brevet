import { describe, it, expect } from "vitest";
import { EndpointPolicy } from "@/lib/models/endpoint-policy";
import { Types } from "mongoose";
import {
  getPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  activatePolicy,
  toggleHotWallet,
  archivePolicy,
} from "../policies";

const uid = () => new Types.ObjectId().toString();

describe("getPolicies", () => {
  it("returns all policies for a user", async () => {
    const userId = uid();
    const otherUser = uid();
    await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://a.com", status: "active" });
    await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://b.com", status: "draft" });
    await EndpointPolicy.create({ userId: new Types.ObjectId(otherUser), endpointPattern: "https://c.com", status: "active" });

    const result = await getPolicies(userId);
    expect(result).toHaveLength(2);
  });

  it("filters by status when provided", async () => {
    const userId = uid();
    await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://a.com", status: "active" });
    await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://b.com", status: "draft" });

    const result = await getPolicies(userId, "active");
    expect(result).toHaveLength(1);
    expect(result[0].endpointPattern).toBe("https://a.com");
  });
});

describe("getPolicy", () => {
  it("returns a policy by ID", async () => {
    const userId = uid();
    const created = await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://a.com" });

    const found = await getPolicy(created._id.toString());
    expect(found).not.toBeNull();
    expect(found!.endpointPattern).toBe("https://a.com");
  });

  it("returns null for non-existent ID", async () => {
    const found = await getPolicy(new Types.ObjectId().toString());
    expect(found).toBeNull();
  });
});

describe("createPolicy", () => {
  it("creates a policy", async () => {
    const userId = uid();
    const policy = await createPolicy(userId, {
      endpointPattern: "https://api.example.com",
      status: "active",
    });

    expect(policy).not.toBeNull();
    expect(policy!.id).toBeDefined();
    expect(policy!.endpointPattern).toBe("https://api.example.com");
  });

  it("returns null if duplicate endpointPattern for same user", async () => {
    const userId = uid();
    await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://api.example.com" });

    const result = await createPolicy(userId, { endpointPattern: "https://api.example.com" });
    expect(result).toBeNull();
  });
});

describe("updatePolicy", () => {
  it("updates policy fields", async () => {
    const userId = uid();
    const created = await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://a.com", payFromHotWallet: false });

    const updated = await updatePolicy(created._id.toString(), userId, { payFromHotWallet: true });
    expect(updated).not.toBeNull();
    expect(updated!.payFromHotWallet).toBe(true);
  });

  it("returns null if endpointPattern conflicts", async () => {
    const userId = uid();
    const p1 = await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://a.com" });
    await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://b.com" });

    const result = await updatePolicy(p1._id.toString(), userId, { endpointPattern: "https://b.com" });
    expect(result).toBeNull();
  });
});

describe("activatePolicy", () => {
  it("sets status to active", async () => {
    const userId = uid();
    const created = await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://a.com", status: "draft" });

    const updated = await activatePolicy(created._id.toString());
    expect(updated!.status).toBe("active");
  });
});

describe("toggleHotWallet", () => {
  it("toggles payFromHotWallet", async () => {
    const userId = uid();
    const created = await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://a.com", payFromHotWallet: false });

    const updated = await toggleHotWallet(created._id.toString(), true);
    expect(updated!.payFromHotWallet).toBe(true);
  });
});

describe("archivePolicy", () => {
  it("sets status to archived and archivedAt timestamp", async () => {
    const userId = uid();
    const created = await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://a.com", status: "active" });

    const updated = await archivePolicy(created._id.toString());
    expect(updated!.status).toBe("archived");
    expect(updated!.archivedAt).toBeInstanceOf(Date);
  });
});
