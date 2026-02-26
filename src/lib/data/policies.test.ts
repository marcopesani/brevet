import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

vi.mock("@/lib/db", () => ({ connectDB: vi.fn(() => Promise.resolve()) }));

const mockFindOne = vi.fn();
vi.mock("@/lib/models/endpoint-policy", () => ({
  EndpointPolicy: {
    findOne: mockFindOne,
  },
  EndpointPolicyDTO: {
    parse: (doc: unknown) => doc,
  },
}));

describe("policies data layer — user scoping", () => {
  beforeEach(() => {
    mockFindOne.mockReset();
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
});
