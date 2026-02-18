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
  validateEndpointPattern,
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

    const updated = await activatePolicy(created._id.toString(), userId);
    expect(updated!.status).toBe("active");
  });

  it("returns null when userId does not match (IDOR protection)", async () => {
    const userId = uid();
    const attackerId = uid();
    const created = await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://a.com", status: "draft" });

    const result = await activatePolicy(created._id.toString(), attackerId);
    expect(result).toBeNull();

    // Verify original was not modified
    const original = await EndpointPolicy.findById(created._id).lean();
    expect(original!.status).toBe("draft");
  });
});

describe("toggleHotWallet", () => {
  it("toggles payFromHotWallet", async () => {
    const userId = uid();
    const created = await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://a.com", payFromHotWallet: false });

    const updated = await toggleHotWallet(created._id.toString(), userId, true);
    expect(updated!.payFromHotWallet).toBe(true);
  });

  it("returns null when userId does not match (IDOR protection)", async () => {
    const userId = uid();
    const attackerId = uid();
    const created = await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://a.com", payFromHotWallet: false });

    const result = await toggleHotWallet(created._id.toString(), attackerId, true);
    expect(result).toBeNull();

    // Verify original was not modified
    const original = await EndpointPolicy.findById(created._id).lean();
    expect(original!.payFromHotWallet).toBe(false);
  });
});

describe("archivePolicy", () => {
  it("sets status to archived and archivedAt timestamp", async () => {
    const userId = uid();
    const created = await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://a.com", status: "active" });

    const updated = await archivePolicy(created._id.toString(), userId);
    expect(updated!.status).toBe("archived");
    expect(updated!.archivedAt).toBeInstanceOf(Date);
  });

  it("returns null when userId does not match (IDOR protection)", async () => {
    const userId = uid();
    const attackerId = uid();
    const created = await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://a.com", status: "active" });

    const result = await archivePolicy(created._id.toString(), attackerId);
    expect(result).toBeNull();

    // Verify original was not modified
    const original = await EndpointPolicy.findById(created._id).lean();
    expect(original!.status).toBe("active");
  });
});

describe("chainId support", () => {
  it("getPolicies filters by chainId", async () => {
    const userId = uid();
    await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://a.com", status: "active", chainId: 8453 });
    await EndpointPolicy.create({ userId: new Types.ObjectId(userId), endpointPattern: "https://a.com", status: "active", chainId: 42161 });

    const baseOnly = await getPolicies(userId, undefined, { chainId: 8453 });
    expect(baseOnly).toHaveLength(1);
    expect(baseOnly[0].chainId).toBe(8453);

    const arbOnly = await getPolicies(userId, undefined, { chainId: 42161 });
    expect(arbOnly).toHaveLength(1);
    expect(arbOnly[0].chainId).toBe(42161);

    const all = await getPolicies(userId);
    expect(all).toHaveLength(2);
  });

  it("createPolicy stores chainId when provided", async () => {
    const userId = uid();
    const policy = await createPolicy(userId, {
      endpointPattern: "https://arb-api.example.com",
      status: "active",
      chainId: 42161,
    });

    expect(policy).not.toBeNull();
    expect(policy!.chainId).toBe(42161);
  });

  it("createPolicy allows same endpoint on different chains", async () => {
    const userId = uid();
    const p1 = await createPolicy(userId, {
      endpointPattern: "https://api.example.com",
      chainId: 8453,
    });
    const p2 = await createPolicy(userId, {
      endpointPattern: "https://api.example.com",
      chainId: 42161,
    });

    expect(p1).not.toBeNull();
    expect(p2).not.toBeNull();
    expect(p1!.chainId).toBe(8453);
    expect(p2!.chainId).toBe(42161);
  });

  it("createPolicy rejects duplicate endpoint+chainId for same user", async () => {
    const userId = uid();
    await createPolicy(userId, {
      endpointPattern: "https://api.example.com",
      chainId: 42161,
    });
    const dup = await createPolicy(userId, {
      endpointPattern: "https://api.example.com",
      chainId: 42161,
    });

    expect(dup).toBeNull();
  });
});

describe("validateEndpointPattern (M11)", () => {
  it("accepts valid https URL", () => {
    expect(validateEndpointPattern("https://api.example.com")).toBeNull();
  });

  it("accepts valid http URL", () => {
    expect(validateEndpointPattern("http://api.example.com")).toBeNull();
  });

  it("accepts URL with path", () => {
    expect(validateEndpointPattern("https://api.example.com/v1/data")).toBeNull();
  });

  it("rejects non-URL string", () => {
    expect(validateEndpointPattern("not-a-url")).not.toBeNull();
  });

  it("rejects ftp protocol", () => {
    expect(validateEndpointPattern("ftp://files.example.com")).not.toBeNull();
  });

  it("rejects javascript protocol", () => {
    expect(validateEndpointPattern("javascript:alert(1)")).not.toBeNull();
  });
});

describe("createPolicy endpoint pattern validation (M11)", () => {
  it("throws for invalid endpoint pattern", async () => {
    const userId = uid();
    await expect(
      createPolicy(userId, { endpointPattern: "not-a-url" }),
    ).rejects.toThrow("valid URL");
  });

  it("throws for non-http protocol", async () => {
    const userId = uid();
    await expect(
      createPolicy(userId, { endpointPattern: "ftp://files.example.com" }),
    ).rejects.toThrow("http or https");
  });

  it("succeeds for valid https pattern", async () => {
    const userId = uid();
    const policy = await createPolicy(userId, {
      endpointPattern: "https://api.example.com",
      status: "active",
    });
    expect(policy).not.toBeNull();
    expect(policy!.endpointPattern).toBe("https://api.example.com");
  });
});
