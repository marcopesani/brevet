import { describe, it, expect, vi, beforeEach } from "vitest";

// Set required env vars before any module loads (vi.hoisted runs before vi.mock factories)
vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-that-is-at-least-32-chars-long";
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = "test-project-id";
});

// Mock next-auth's getServerSession
const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

// Mock next-auth/providers/credentials (imported by auth.ts)
vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn().mockReturnValue({ id: "credentials", name: "Ethereum" }),
}));

// Mock @reown/appkit-siwe (imported by auth.ts)
vi.mock("@reown/appkit-siwe", () => ({
  verifySignature: vi.fn(),
  getChainIdFromMessage: vi.fn(),
  getAddressFromMessage: vi.fn(),
}));

// Mock hot-wallet (imported by auth.ts)
vi.mock("@/lib/hot-wallet", () => ({
  createHotWallet: vi.fn(),
}));

// Mock prisma user.findUnique directly for unit-level control
const mockFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: (...args: any[]) => mockFindUnique(...args) },
  },
}));

import { getAuthenticatedUser } from "../auth";

describe("getAuthenticatedUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { userId, walletAddress } when session has valid address", async () => {
    mockGetServerSession.mockResolvedValue({
      address: "0xABCdef1234567890abcdef1234567890ABCDEF12",
      chainId: 8453,
    });
    mockFindUnique.mockResolvedValue({
      id: "user-123",
      walletAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
    });

    const result = await getAuthenticatedUser();
    expect(result).toEqual({
      userId: "user-123",
      walletAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
    });
  });

  it("returns null when no session exists", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const result = await getAuthenticatedUser();
    expect(result).toBeNull();
  });

  it("returns null when session has no address", async () => {
    mockGetServerSession.mockResolvedValue({ chainId: 8453 });
    const result = await getAuthenticatedUser();
    expect(result).toBeNull();
  });

  it("returns null when user not found in database", async () => {
    mockGetServerSession.mockResolvedValue({
      address: "0xABCdef1234567890abcdef1234567890ABCDEF12",
      chainId: 8453,
    });
    mockFindUnique.mockResolvedValue(null);
    const result = await getAuthenticatedUser();
    expect(result).toBeNull();
  });

  it("lowercases the address for DB lookup", async () => {
    mockGetServerSession.mockResolvedValue({
      address: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
      chainId: 8453,
    });
    mockFindUnique.mockResolvedValue({
      id: "user-456",
      walletAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
    });

    await getAuthenticatedUser();
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        walletAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
      },
    });
  });
});
