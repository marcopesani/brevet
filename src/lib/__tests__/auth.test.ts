import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth-config", () => ({
  authOptions: {},
}));

import { getServerSession } from "next-auth";
import { getAuthenticatedUser } from "../auth";

const mockGetServerSession = vi.mocked(getServerSession);

describe("getAuthenticatedUser", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
  });

  it("returns userId and walletAddress when session is valid", async () => {
    mockGetServerSession.mockResolvedValue({
      userId: "user-123",
      address: "0xabc",
      chainId: 1,
      expires: "",
    });

    const user = await getAuthenticatedUser();
    expect(user).toEqual({
      userId: "user-123",
      walletAddress: "0xabc",
    });
  });

  it("returns null when session is null", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const user = await getAuthenticatedUser();
    expect(user).toBeNull();
  });

  it("returns null when session has no userId", async () => {
    mockGetServerSession.mockResolvedValue({
      address: "0xabc",
      chainId: 1,
      expires: "",
    } as unknown as Awaited<ReturnType<typeof getServerSession>>);

    const user = await getAuthenticatedUser();
    expect(user).toBeNull();
  });

  it("returns null when session has no address", async () => {
    mockGetServerSession.mockResolvedValue({
      userId: "user-123",
      chainId: 1,
      expires: "",
    } as unknown as Awaited<ReturnType<typeof getServerSession>>);

    const user = await getAuthenticatedUser();
    expect(user).toBeNull();
  });
});
