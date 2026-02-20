import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetTestDb } from "@/test/helpers/db";
import { EndpointPolicy } from "@/lib/models/endpoint-policy";
import mongoose from "mongoose";

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock auth
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(),
}));

const TEST_USER_ID = new mongoose.Types.ObjectId().toString();

describe("createPolicy server action", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetTestDb();
  });

  it("returns { success: true, policy } for valid input", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    const { createPolicy } = await import("../policies");
    const result = await createPolicy({
      endpointPattern: "https://api.example.com",
      autoSign: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        policy: expect.objectContaining({
          endpointPattern: "https://api.example.com",
          autoSign: true,
        }),
      }),
    );

    // Verify policy was persisted
    const docs = await EndpointPolicy.find({}).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].endpointPattern).toBe("https://api.example.com");
  });

  it("returns { success: false, error } for duplicate endpoint pattern", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    // Pre-create a policy
    await EndpointPolicy.create({
      userId: new mongoose.Types.ObjectId(TEST_USER_ID),
      endpointPattern: "https://api.example.com",
      autoSign: false,
      status: "active",
    });

    const { createPolicy } = await import("../policies");
    const result = await createPolicy({
      endpointPattern: "https://api.example.com",
    });

    expect(result).toEqual({
      success: false,
      error: "A policy for this endpoint pattern already exists",
    });

    // Verify no additional policy was created
    const docs = await EndpointPolicy.find({}).lean();
    expect(docs).toHaveLength(1);
  });

  it("throws for unauthenticated user", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const { createPolicy } = await import("../policies");
    await expect(
      createPolicy({ endpointPattern: "https://api.example.com" }),
    ).rejects.toThrow("Unauthorized");
  });
});
