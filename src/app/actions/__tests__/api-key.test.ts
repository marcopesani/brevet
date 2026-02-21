import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock auth
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(),
}));

// Mock data layer
vi.mock("@/lib/data/users", () => ({
  getApiKeyPrefix: vi.fn(),
  rotateApiKey: vi.fn(),
}));

const TEST_USER_ID = "507f1f77bcf86cd799439011";

describe("getApiKeyInfo server action", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns prefix for authenticated user", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    const { getApiKeyPrefix } = await import("@/lib/data/users");
    vi.mocked(getApiKeyPrefix).mockResolvedValue("brv_a1b2");

    const { getApiKeyInfo } = await import("../api-key");
    const result = await getApiKeyInfo();

    expect(result).toEqual({ prefix: "brv_a1b2" });
    expect(getApiKeyPrefix).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it("throws when not authenticated", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const { getApiKeyInfo } = await import("../api-key");
    await expect(getApiKeyInfo()).rejects.toThrow("Unauthorized");
  });
});

describe("regenerateApiKey server action", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls rotateApiKey, revalidates path, and returns raw key", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: TEST_USER_ID,
      walletAddress: "0x1234",
    });

    const { rotateApiKey } = await import("@/lib/data/users");
    vi.mocked(rotateApiKey).mockResolvedValue({
      rawKey: "brv_newkey1234567890abcdef12345678",
    });

    const { revalidatePath } = await import("next/cache");

    const { regenerateApiKey } = await import("../api-key");
    const result = await regenerateApiKey();

    expect(result).toEqual({ rawKey: "brv_newkey1234567890abcdef12345678" });
    expect(rotateApiKey).toHaveBeenCalledWith(TEST_USER_ID);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/settings");
  });

  it("throws when not authenticated", async () => {
    const { getAuthenticatedUser } = await import("@/lib/auth");
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const { regenerateApiKey } = await import("../api-key");
    await expect(regenerateApiKey()).rejects.toThrow("Unauthorized");
  });
});
