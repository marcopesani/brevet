import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetTestDb } from "@/test/helpers/db";

// Set required env vars and declare hoisted variables before vi.mock factories run
const {
  capturedAuthorizeRef,
  mockVerifyResultRef,
  MOCK_ADDRESS,
} = vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-that-is-at-least-32-chars-long";
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = "test-project-id";
  return {
    capturedAuthorizeRef: { current: null as ((credentials: any, req: any) => Promise<any>) | null },
    mockVerifyResultRef: { current: true },
    MOCK_ADDRESS: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  };
});

// Capture the authorize function when CredentialsProvider is called
vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn().mockImplementation((config: any) => {
    capturedAuthorizeRef.current = config.authorize;
    return { id: "credentials", name: "Ethereum", ...config };
  }),
}));

// Mock @reown/appkit-siwe
vi.mock("@reown/appkit-siwe", () => ({
  verifySignature: vi.fn().mockImplementation(async () => mockVerifyResultRef.current),
  getAddressFromMessage: vi.fn().mockImplementation(() => MOCK_ADDRESS),
  getChainIdFromMessage: vi.fn().mockReturnValue("8453"),
}));

// Mock hot wallet creation
vi.mock("@/lib/hot-wallet", () => ({
  createHotWallet: vi.fn().mockReturnValue({
    address: "0x" + "d".repeat(40),
    encryptedPrivateKey: "mock-encrypted-key",
  }),
}));

// Import auth to trigger CredentialsProvider and capture authorize
import "@/lib/auth";

// Helper to call captured authorize safely
function authorize(credentials: any) {
  if (!capturedAuthorizeRef.current) throw new Error("authorize not captured");
  return capturedAuthorizeRef.current(credentials, {} as any);
}

describe("NextAuth authorize callback", () => {
  beforeEach(async () => {
    mockVerifyResultRef.current = true;
    await resetTestDb();
  });

  it("creates new user with hot wallet on first login", async () => {
    const { createHotWallet } = await import("@/lib/hot-wallet");

    const result = await authorize({
      message: "mock-siwe-message",
      signature: "0xmocksig",
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe(`8453:${MOCK_ADDRESS}`);
    expect(createHotWallet).toHaveBeenCalled();

    // Verify user was created in the mock DB
    const user = await prisma.user.findUnique({
      where: { walletAddress: MOCK_ADDRESS.toLowerCase() },
    });
    expect(user).not.toBeNull();
    expect(user?.walletAddress).toBe(MOCK_ADDRESS.toLowerCase());
  });

  it("returns existing user without creating duplicates", async () => {
    // Pre-seed user
    await prisma.user.create({
      data: {
        walletAddress: MOCK_ADDRESS.toLowerCase(),
      },
    });
    // Pre-seed hot wallet for include: { hotWallet: true } to find
    const users = await prisma.user.findMany({
      where: { walletAddress: MOCK_ADDRESS.toLowerCase() },
    });
    const userId = users[0].id;
    await prisma.hotWallet.create({
      data: {
        address: "0x" + "e".repeat(40),
        encryptedPrivateKey: "existing",
        userId,
      },
    });

    const result = await authorize({
      message: "mock-siwe-message",
      signature: "0xmocksig",
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe(`8453:${MOCK_ADDRESS}`);

    // Verify no duplicate was created
    const allUsers = await prisma.user.findMany({
      where: { walletAddress: MOCK_ADDRESS.toLowerCase() },
    });
    expect(allUsers).toHaveLength(1);
  });

  it("returns null when signature verification fails", async () => {
    mockVerifyResultRef.current = false;

    const result = await authorize({
      message: "mock-siwe-message",
      signature: "0xbadsig",
    });

    expect(result).toBeNull();
  });

  it("returns null when message is missing", async () => {
    const result = await authorize({
      message: "",
      signature: "0xmocksig",
    });

    expect(result).toBeNull();
  });

  it("returns null when credentials.message is undefined", async () => {
    const result = await authorize({
      signature: "0xmocksig",
    });

    expect(result).toBeNull();
  });
});
