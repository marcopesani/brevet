import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

vi.mock("@/lib/db", () => ({ connectDB: vi.fn(() => Promise.resolve()) }));

const mockFindOne = vi.fn();
const mockFindOneAndUpdate = vi.fn();
vi.mock("@/lib/models/endpoint-policy", () => ({
  EndpointPolicy: {
    findOne: mockFindOne,
    findOneAndUpdate: mockFindOneAndUpdate,
  },
  EndpointPolicyDTO: {
    parse: (doc: unknown) => doc,
  },
}));

describe("policies data layer — user scoping", () => {
  beforeEach(() => {
    mockFindOne.mockReset();
    mockFindOneAndUpdate.mockReset();
  });

  it("getPolicy uses user-scoped filter (findOne with _id and userId)", async () => {
    const { getPolicy } = await import("@/lib/data/policies");
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });

    const policyId = "507f1f77bcf86cd799439011";
    const userId = "507f1f77bcf86cd799439012";
    await getPolicy(policyId, userId);

    expect(mockFindOne).toHaveBeenCalledTimes(1);
    const filter = mockFindOne.mock.calls[0][0];
    expect(filter).toHaveProperty("_id", policyId);
    expect(filter).toHaveProperty("userId");
    expect(filter.userId).toBeInstanceOf(Types.ObjectId);
    expect((filter.userId as Types.ObjectId).toString()).toBe(userId);
  });

  it("getPolicy returns null when policy not found for user", async () => {
    const { getPolicy } = await import("@/lib/data/policies");
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });

    const result = await getPolicy("507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012");

    expect(result).toBeNull();
  });

  it("ensureAutoSignPolicy throws on invalid URL", async () => {
    const { ensureAutoSignPolicy } = await import("@/lib/data/policies");

    await expect(
      ensureAutoSignPolicy("507f1f77bcf86cd799439012", "not-a-url", 8453),
    ).rejects.toThrow();
  });

  it("ensureAutoSignPolicy uses origin (not full URL) as endpointPattern", async () => {
    const { ensureAutoSignPolicy } = await import("@/lib/data/policies");
    const fakeDoc = { endpointPattern: "https://api.example.com", autoSign: true, status: "active" };
    mockFindOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(fakeDoc) });

    const userId = "507f1f77bcf86cd799439012";
    await ensureAutoSignPolicy(userId, "https://api.example.com/v1/resource?foo=bar", 8453);

    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
    const filter = mockFindOneAndUpdate.mock.calls[0][0];
    expect(filter.endpointPattern).toBe("https://api.example.com");
    expect(filter.chainId).toBe(8453);
  });
});
