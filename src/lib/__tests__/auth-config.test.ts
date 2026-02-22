import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock viem before importing the module under test
vi.mock("viem", () => {
  const mockVerifyMessage = vi.fn();
  return {
    createPublicClient: vi.fn(() => ({
      verifyMessage: mockVerifyMessage,
    })),
    http: vi.fn((url: string) => url),
    __mockVerifyMessage: mockVerifyMessage,
  };
});

vi.mock("@reown/appkit-siwe", () => ({
  getAddressFromMessage: vi.fn(),
  getChainIdFromMessage: vi.fn(),
}));

vi.mock("@/lib/hot-wallet", () => ({
  createHotWallet: vi.fn(() => ({
    address: "0xhotwallet",
    encryptedPrivateKey: "encrypted-key",
  })),
}));

const mockEnsureApiKey = vi.fn().mockResolvedValue({ created: true, rawKey: "brv_testkey1234567890abcdef12345678" });
vi.mock("@/lib/data/users", () => ({
  ensureApiKey: (...args: unknown[]) => mockEnsureApiKey(...args),
}));

import { createPublicClient, http } from "viem";
import { User } from "@/lib/models/user";
import { HotWallet } from "@/lib/models/hot-wallet";
import {
  extractCredentials,
  verifySignature,
  upsertUser,
  authOptions,
} from "../auth-config";
import { resetTestDb } from "../../test/helpers/db";

// Access the mock verifyMessage function
const mockVerifyMessage = (
  (await import("viem")) as unknown as { __mockVerifyMessage: ReturnType<typeof vi.fn> }
).__mockVerifyMessage;

describe("extractCredentials", () => {
  it("returns message and signature when both are provided", () => {
    const result = extractCredentials({
      message: "hello",
      signature: "0xsig",
    });
    expect(result).toEqual({ message: "hello", signature: "0xsig" });
  });

  it("throws when credentials is undefined", () => {
    expect(() => extractCredentials(undefined)).toThrow(
      "Missing message or signature",
    );
  });

  it("throws when message is missing", () => {
    expect(() => extractCredentials({ signature: "0xsig" })).toThrow(
      "Missing message or signature",
    );
  });

  it("throws when signature is missing", () => {
    expect(() => extractCredentials({ message: "hello" })).toThrow(
      "Missing message or signature",
    );
  });

  it("throws when message is empty string", () => {
    expect(() =>
      extractCredentials({ message: "", signature: "0xsig" }),
    ).toThrow("Missing message or signature");
  });

  it("throws when signature is empty string", () => {
    expect(() =>
      extractCredentials({ message: "hello", signature: "" }),
    ).toThrow("Missing message or signature");
  });
});

describe("verifySignature", () => {
  beforeEach(() => {
    vi.mocked(createPublicClient).mockClear();
    mockVerifyMessage.mockReset();
    vi.mocked(http).mockClear();
  });

  it("returns true for a valid signature", async () => {
    mockVerifyMessage.mockResolvedValue(true);

    const result = await verifySignature(
      "siwe message",
      "0xAbC123",
      "0xsignature",
      "eip155:1",
    );

    expect(result).toBe(true);
    expect(mockVerifyMessage).toHaveBeenCalledWith({
      message: "siwe message",
      address: "0xAbC123",
      signature: "0xsignature",
    });
  });

  it("returns false for an invalid signature", async () => {
    mockVerifyMessage.mockResolvedValue(false);

    const result = await verifySignature(
      "siwe message",
      "0xAbC123",
      "0xbadsig",
      "eip155:1",
    );

    expect(result).toBe(false);
  });

  it("uses WalletConnect RPC URL with chainId and projectId", async () => {
    mockVerifyMessage.mockResolvedValue(true);

    await verifySignature("msg", "0xAddr", "0xsig", "eip155:84532");

    expect(http).toHaveBeenCalledWith(
      expect.stringContaining("chainId=eip155:84532"),
    );
    expect(http).toHaveBeenCalledWith(
      expect.stringContaining("projectId=test-project-id"),
    );
    expect(http).toHaveBeenCalledWith(
      expect.stringContaining("rpc.walletconnect.org"),
    );
  });
});

describe("upsertUser", () => {
  beforeEach(async () => {
    await resetTestDb();
    mockEnsureApiKey.mockClear();
  });

  it("calls ensureApiKey for new user", async () => {
    const user = await upsertUser("0xapikey");
    expect(mockEnsureApiKey).toHaveBeenCalledWith(user.id);
  });

  it("calls ensureApiKey for existing user", async () => {
    await User.create({ walletAddress: "0xexistingkey" });
    const user = await upsertUser("0xexistingkey");
    expect(mockEnsureApiKey).toHaveBeenCalledWith(user.id);
  });

  it("returns existing user without creating any wallets", async () => {
    const existingUser = await User.create({
      walletAddress: "0xexisting",
    });

    const user = await upsertUser("0xexisting");

    expect(user.id).toBe(existingUser.id);
    expect(user.walletAddress).toBe("0xexisting");

    // No hot wallets should be created at login
    const wallets = await HotWallet.find({ userId: user._id }).lean();
    expect(wallets).toHaveLength(0);
  });

  it("creates new user without creating any wallets or smart accounts", async () => {
    const user = await upsertUser("0xnewuser");

    expect(user.walletAddress).toBe("0xnewuser");

    // Verify user was created in the database
    const userCount = await User.countDocuments();
    expect(userCount).toBe(1);

    // No hot wallets should be created at login
    const wallets = await HotWallet.find({ userId: user._id }).lean();
    expect(wallets).toHaveLength(0);
  });

  it("is idempotent — returns same user on repeated login", async () => {
    const user1 = await upsertUser("0xrepeat");
    const user2 = await upsertUser("0xrepeat");

    expect(user1.id).toBe(user2.id);

    // Still no wallets created
    const wallets = await HotWallet.find({ userId: user1._id }).lean();
    expect(wallets).toHaveLength(0);
  });

  it("backfills enabledChains for existing user with empty array", async () => {
    const existing = await User.create({ walletAddress: "0xlegacy" });
    expect(existing.enabledChains).toEqual([]);

    const user = await upsertUser("0xlegacy");

    expect(user.enabledChains.length).toBeGreaterThan(0);
    const dbUser = await User.findById(user._id).lean();
    expect(dbUser!.enabledChains.length).toBeGreaterThan(0);
  });

  it("does not overwrite existing enabledChains on login", async () => {
    await User.create({ walletAddress: "0xhas-chains", enabledChains: [84532] });

    const user = await upsertUser("0xhas-chains");

    expect(user.enabledChains).toEqual([84532]);
  });
});

describe("authOptions callbacks", () => {
  const jwtCallback = authOptions.callbacks!.jwt as unknown as (params: { token: Record<string, unknown>; user?: { id: string; address: string; chainId: number } }) => Record<string, unknown>;
  const sessionCallback = authOptions.callbacks!.session as unknown as (params: { session: Record<string, unknown>; token: Record<string, unknown> }) => Record<string, unknown>;

  describe("jwt callback", () => {
    it("sets userId, address, chainId on token when user is provided", () => {
      const token: Record<string, unknown> = { sub: "sub-1" };
      const user = { id: "user-1", address: "0xabc", chainId: 1 };

      const result = jwtCallback({ token, user });

      expect(result.userId).toBe("user-1");
      expect(result.address).toBe("0xabc");
      expect(result.chainId).toBe(1);
    });

    it("returns token unchanged when no user is provided", () => {
      const token: Record<string, unknown> = {
        sub: "sub-1",
        userId: "existing",
        address: "0xold",
        chainId: 42,
      };

      const result = jwtCallback({ token, user: undefined });

      expect(result.userId).toBe("existing");
      expect(result.address).toBe("0xold");
      expect(result.chainId).toBe(42);
    });
  });

  describe("session callback", () => {
    it("enriches session with userId, address, chainId from token", () => {
      const session: Record<string, unknown> = {};
      const token: Record<string, unknown> = {
        userId: "user-1",
        address: "0xabc",
        chainId: 1,
      };

      const result = sessionCallback({ session, token });

      expect(result.userId).toBe("user-1");
      expect(result.address).toBe("0xabc");
      expect(result.chainId).toBe(1);
    });
  });
});
